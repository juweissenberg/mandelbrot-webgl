const mat4 = glMatrix.mat4;

// Vertex shader program
const vsSource = `
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    varying highp vec2 vTextureCoord;

    void main(void) {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
        vTextureCoord = aTextureCoord;
    }
`;

// Fragment shader program
const fsSource = `
    varying highp vec2 vTextureCoord;

    uniform sampler2D uSampler;

    void main(void) {
        highp float x = vTextureCoord[0];
        highp float y = vTextureCoord[1];

        highp float reStart = -3.5;
        highp float reEnd = 2.5;
        highp float imStart = -2.25;
        highp float imEnd = 2.25;

        const int maxIter = 80;

        highp float c_real = reStart + (x * (reEnd - reStart));
        highp float c_imaginary = imStart + (y * (imEnd - imStart));

        highp float z_real = 0.0;
        highp float z_imaginary = 0.0;
        
        int iter = 0;
        for(int i = 0; i < maxIter; i++) {
            
            highp float nr = z_real * z_real - z_imaginary * z_imaginary + c_real;
            highp float ni = 2.0 * z_real * z_imaginary + c_imaginary;

            z_real = nr;
            z_imaginary = ni;

            if(sqrt(z_real*z_real + z_imaginary*z_imaginary) > 2.0){
                iter = i;
                break;
            }
        }

        highp float level = float(iter) / float(maxIter) * 0.8 + 0.1; 

        gl_FragColor = vec4(level, level * 0.6, 0.1, 1.0);
    }
`;

function initGL(canvas) {
    
    // Initialize the GL context
    const gl = canvas.getContext("webgl");

    // Only continue if WebGL is available and working
    if (gl === null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    return gl;
}

//
// Initialize a shader program, so WebGL knows how to draw our data
//
function initShaderProgram(gl, vsSource, fsSource) {

    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program

    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}

//
// creates a shader of the given type, uploads the source and
// compiles it.
//
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object

    gl.shaderSource(shader, source);

    // Compile the shader program

    gl.compileShader(shader);

    // See if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

// Create a buffer for the square's positions.
function initBuffers(gl) {

    const positionBuffer = gl.createBuffer();

    // Select the positionBuffer as the one to apply buffer
    // operations to from here out.

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // Now create an array of positions for the square.

    const positions = [
    -2.0,  1.5,
    2.0,  1.5,
    -2.0, -1.5,
    2.0, -1.5,
    ];

    // Now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // JavaScript array, then use it to fill the current buffer.

    gl.bufferData(gl.ARRAY_BUFFER,
                new Float32Array(positions),
                gl.STATIC_DRAW);

    const textureCoordBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, textureCoordBuffer);

    const textureCoordinates = [
        0.0,  0.0,
        1.0,  0.0,
        0.0,  1.0,
        1.0,  1.0,
    ];

    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(textureCoordinates),
            gl.STATIC_DRAW);

    return {
        position: positionBuffer,
        textureCoord: textureCoordBuffer,
    };
}

function loadTexture(gl) {

    // Create a texture.
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Fill the texture with a 1x1 blue pixel.
    const level = 0;
    const internalFormat = gl.RGBA;
    const width = 1;
    const height = 1;
    const border = 0;
    const srcFormat = gl.RGBA;
    const srcType = gl.UNSIGNED_BYTE;
    const pixel = new Uint8Array([100, 120, 150, 255]);  // opaque blue
    gl.texImage2D(gl.TEXTURE_2D, level, internalFormat,
                    width, height, border, srcFormat, srcType,
                    pixel);

    return texture;
}

const canvas = document.querySelector("#glCanvas");

const gl = initGL(canvas);

const shaderProgram = initShaderProgram(gl, vsSource, fsSource);

const programInfo = {
    program: shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
    },
    uniformLocations: {
        projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
        modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
        uSampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
    },
};

const buffers = initBuffers(gl);
const texture = loadTexture(gl);

var cameraViewMatrix = [0.0, 0.0, -3.0];

const zoom = 1.5;
const minX = -2.0;
const maxX = 2.0;
const minY = -1.5;
const maxY = 1.5;
var down = false;
var mouseX, mouseY;
var step = 0.0025;

function handleWheel(event) {
    if(event.deltaY < 0) {
        cameraViewMatrix[2] /= zoom;
        step /= zoom;
    } else {
        if(cameraViewMatrix[2] > -3.0) {
            cameraViewMatrix[2] *= zoom;
            step *= zoom;
        }
    }
    drawScene(gl, programInfo, buffers, texture);
}

function handleMouseDown(event) {
    down = true;
    mouseX = event.pageX;
    mouseY = event.pageY;
}

function handleMouseUp(event) {
    down = false;
}

function handleMouseMove(event) {
    if(down){
        const x = event.pageX;
        const y = event.pageY;

        var tx = mouseX - x;
        var ty = mouseY - y;

        mouseX = x;
        mouseY = y;

        cameraViewMatrix[0] -= tx * step;
        cameraViewMatrix[1] += ty * step;
        cameraViewMatrix[0] = cameraViewMatrix[0]>minX? cameraViewMatrix[0]: minX;
        cameraViewMatrix[0] = cameraViewMatrix[0]<maxX? cameraViewMatrix[0]: maxX;
        cameraViewMatrix[1] = cameraViewMatrix[1]>minY? cameraViewMatrix[1]: minY;
        cameraViewMatrix[1] = cameraViewMatrix[1]<maxY? cameraViewMatrix[1]: maxY;

        drawScene(gl, programInfo, buffers, texture);
    }
}

canvas.addEventListener("wheel", handleWheel);
canvas.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("mousemove", handleMouseMove);

var touchesDist;

function handleTouchStart(event) {
    if(event.touches.length===1){
        down = true;
        mouseX = event.touches[0].pageX;
        mouseY = event.touches[0].pageY;
        event.preventDefault();
    } else if (event.touches.length===2) {
        down = true;
        touchesDist = abs(touches[0].pageX - touches[1].pageX)
                    + abs(touches[0].pageY - touches[1].pageY);
        event.preventDefault();
    }
}

function handleTouchEnd(event) {
    down = false;
    event.preventDefault();
}

function handleTouchMove(event) {
    if(down){
        if(event.touches.length===1){
            event.preventDefault();

            const x = event.touches[0].pageX;
            const y = event.touches[0].pageY;

            var tx = mouseX - x;
            var ty = mouseY - y;

            mouseX = x;
            mouseY = y;

            cameraViewMatrix[0] -= tx * step;
            cameraViewMatrix[1] += ty * step;
            cameraViewMatrix[0] = cameraViewMatrix[0]>minX? cameraViewMatrix[0]: minX;
            cameraViewMatrix[0] = cameraViewMatrix[0]<maxX? cameraViewMatrix[0]: maxX;
            cameraViewMatrix[1] = cameraViewMatrix[1]>minY? cameraViewMatrix[1]: minY;
            cameraViewMatrix[1] = cameraViewMatrix[1]<maxY? cameraViewMatrix[1]: maxY;

            drawScene(gl, programInfo, buffers, texture);

        } else if(event.touches.length===2) {
            event.preventDefault();

            dist = abs(touches[0].pageX - touches[1].pageX)
                    + abs(touches[0].pageY - touches[1].pageY);

            touchzoom = touchesDist - dist;
            touchzoom *= 10;

            if(touchzoom < 0) {
                cameraViewMatrix[2] /= abs(touchzoom);
                step /= abs(touchzoom);
            } else if(touchzoom > 0) {
                if(cameraViewMatrix[2] > -3.0) {
                    cameraViewMatrix[2] *= touchzoom;
                    step *= touchzoom;
                }
            }

            touchesDist = dist;

            drawScene(gl, programInfo, buffers, texture);
        }
    }
}

canvas.addEventListener("touchstart", handleTouchStart);
document.addEventListener("touchend", handleTouchEnd);
document.addEventListener("touchmove", handleTouchMove);

function drawScene(gl, programInfo, buffers, texture) {
    gl.clearColor(0.1, 0.06, 0.1, 1.0); // clear with chosen color
    gl.clearDepth(1.0);                 // Clear everything
    gl.enable(gl.DEPTH_TEST);           // Enable depth testing
    gl.depthFunc(gl.LEQUAL);            // Near things obscure far things

    // Clear the canvas before we start drawing on it.

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    // Our field of view is 45 degrees, with a width/height
    // ratio that matches the display size of the canvas
    // and we only want to see objects between 0.1 units
    // and 100 units away from the camera.

    const fieldOfView = 45 * Math.PI / 180;   // in radians
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0.0;
    const zFar = 100.0;
    const projectionMatrix = mat4.create();

    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
    mat4.perspective(projectionMatrix,
                    fieldOfView,
                    aspect,
                    zNear,
                    zFar);

    // Set the drawing position to the "identity" point, which is
    // the center of the scene.
    const modelViewMatrix = mat4.create();

    // Now move the drawing position a bit to where we want to
    // start drawing the square.

    mat4.translate(modelViewMatrix,     // destination matrix
                    modelViewMatrix,     // matrix to translate
                    cameraViewMatrix);  // amount to translate

    // Tell WebGL how to pull out the positions from the position
    // buffer into the vertexPosition attribute.
    {
        const numComponents = 2;  // pull out 2 values per iteration
        const type = gl.FLOAT;    // the data in the buffer is 32bit floats
        const normalize = false;  // don't normalize
        const stride = 0;         // how many bytes to get from one set of values to the next
                                // 0 = use type and numComponents above
        const offset = 0;         // how many bytes inside the buffer to start from
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.position);
        gl.vertexAttribPointer(
            programInfo.attribLocations.vertexPosition,
            numComponents,
            type,
            normalize,
            stride,
            offset);
        gl.enableVertexAttribArray(
            programInfo.attribLocations.vertexPosition);
    }

    // tell webgl how to pull out the texture coordinates from buffer
    {
        const num = 2; // every coordinate composed of 2 values
        const type = gl.FLOAT; // the data in the buffer is 32 bit float
        const normalize = false; // don't normalize
        const stride = 0; // how many bytes to get from one set to the next
        const offset = 0; // how many bytes inside the buffer to start from
        gl.bindBuffer(gl.ARRAY_BUFFER, buffers.textureCoord);
        gl.vertexAttribPointer(programInfo.attribLocations.textureCoord, num, type, normalize, stride, offset);
        gl.enableVertexAttribArray(programInfo.attribLocations.textureCoord);
    }

    // Tell WebGL to use our program when drawing

    gl.useProgram(programInfo.program);

    // Set the shader uniforms

    gl.uniformMatrix4fv(
        programInfo.uniformLocations.projectionMatrix,
        false,
        projectionMatrix);
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.modelViewMatrix,
        false,
        modelViewMatrix);

    // Tell WebGL we want to affect texture unit 0
    gl.activeTexture(gl.TEXTURE0);

    // Bind the texture to texture unit 0
    gl.bindTexture(gl.TEXTURE_2D, texture);

    // Tell the shader we bound the texture to texture unit 0
    gl.uniform1i(programInfo.uniformLocations.uSampler, 0);

    {
        const offset = 0;
        const vertexCount = 4;
        gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
    }
}

function main() {
    // Set clear color to black, fully opaque
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    // Clear the color buffer with specified clear color
    gl.clear(gl.COLOR_BUFFER_BIT);
    // gl.NEAREST is also allowed, instead of gl.LINEAR, as neither mipmap.
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    // Prevents s-coordinate wrapping (repeating).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    // Prevents t-coordinate wrapping (repeating).
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    drawScene(gl, programInfo, buffers, texture);
}

window.onload = main;