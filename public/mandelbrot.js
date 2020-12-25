const mat4 = glMatrix.mat4;

// fertex shader program
const vsSource = `
    precision highp float;
    
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

// fragment shader program
const fsSource = `
    precision highp float;

    varying vec2 vTextureCoord;

    uniform sampler2D uSampler;
    uniform vec2 uResolution;
    uniform float uRealAspectRatio;
    uniform vec2 uZoomCenter;
    uniform float uZoomAmount;
    uniform int uMaxIterations;

    void main(void) {

        vec2 uv = gl_FragCoord.xy / uResolution;
        vec2 c = uZoomCenter + ((uv - vec2(0.5)) * (uZoomAmount));

        float c_real = c[0] * uRealAspectRatio;
        float c_imaginary = c[1];

        float z_real = 0.0;
        float z_imaginary = 0.0;
        
        int iter = 0;
        for(int i = 0; i < 1000; i++) {
            
            if(i > uMaxIterations) break;

            float nr = z_real * z_real - z_imaginary * z_imaginary + c_real;
            float ni = 2.0 * z_real * z_imaginary + c_imaginary;

            z_real = nr;
            z_imaginary = ni;

            if(sqrt(z_real*z_real + z_imaginary*z_imaginary) > 2.0){
                iter = i;
                break;
            }
        }

        float level = float(iter) / float(uMaxIterations) * 0.8 + 0.1; 

        gl_FragColor = vec4(level, level * 0.6, 0.1, 1.0);
    }
`;

// canvas document element used for WebGL rendering
const canvas = document.querySelector("#glCanvas");
// gl context for rendering if client can provide one
const gl = initGL(canvas);

// shader program constructed from the vertex and fragment shaders defined previously
const shaderProgram = initShaderProgram(gl, vsSource, fsSource);
// amount of zoom to apply when zooming in the view
const zoomFactor = 1.1;
// limit to how far we can zoom out
const zoomLimit = 5.0;
// factor determining how fast the view is moved with the mouse
const moveFactorX = 0.001;
const moveFactorY = 0.001;
// bounding limits for the translated view
const minX = -1.5;
const maxX = 1.5;
const minY = -3.0;
const maxY = 3.0;

// buffers containing the vertices rendered
const buffers = initBuffers(gl);

// position matrix for the camera
var cameraViewMatrix = [0.0, 0.0, -3.0];
// x and y position of the center of the view
var offsetX = 0.0;
var offsetY = 0.0;
// current zoom in the view
var zoomAmount = zoomLimit;
// maximum iteration for the mandelbrot algorithm
var maxIter = 80;
// state of the mouse click
var down = false;
// last known position of the mouse
var mouseX;
var mouseY;

// object containing the links to the shaders variables
const programInfo = {
    program: shaderProgram,
    attribLocations: {
        vertexPosition: gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
        textureCoord: gl.getAttribLocation(shaderProgram, 'aTextureCoord'),
    },
    uniformLocations: {
        projectionMatrix: gl.getUniformLocation(shaderProgram, 'uProjectionMatrix'),
        modelViewMatrix: gl.getUniformLocation(shaderProgram, 'uModelViewMatrix'),
        Sampler: gl.getUniformLocation(shaderProgram, 'uSampler'),
        // resolution of the canvas is sent with this link
        resolution: gl.getUniformLocation(shaderProgram, 'uResolution'),
        // actual aspect ratio of the canvas element
        realAspectRatio: gl.getUniformLocation(shaderProgram, 'uRealAspectRatio'),
        // position where the view is moved to is sent with this link
        zoomCenter: gl.getUniformLocation(shaderProgram, 'uZoomCenter'),
        // zoom amount to apply to the view is sent with this link
        zoomAmount: gl.getUniformLocation(shaderProgram, 'uZoomAmount'),
        // max iterations for the mandelbrot algorithm is sent with this link
        maxIterations: gl.getUniformLocation(shaderProgram, 'uMaxIterations'),
    },
};

// updates the uniforms values used in the shaders
function updateUniforms() {
    gl.uniform2f(programInfo.uniformLocations.zoomCenter, offsetX, offsetY);
    gl.uniform1f(programInfo.uniformLocations.zoomAmount, zoomAmount);
    gl.uniform1i(programInfo.uniformLocations.maxIterations, maxIter);
    gl.uniform2f(programInfo.uniformLocations.resolution, 
        canvas.width, 
        canvas.height);
    gl.uniform1f(programInfo.uniformLocations.realAspectRatio, 
        1.0 * gl.canvas.clientWidth / gl.canvas.clientHeight);
}

function handleWheel(event) {
    // check the direction of the wheel movement and zoom/dezoom accordingly
    if(event.deltaY < 0) {
        zoomAmount /= zoomFactor;
    } else {
        zoomAmount *= zoomFactor;
        // prevent from zooming too far away
        zoomAmount = zoomAmount < zoomLimit ? zoomAmount : zoomLimit;
    }
    drawScene(gl, programInfo, buffers);
}

function handleMouseDown(event) {
    // the view can now be moved along with the mouse
    down = true;

    // initialize the mouse position saved for the translation process
    mouseX = event.pageX;
    mouseY = event.pageY;
}

function handleMouseUp(event) {
    // we prevent the view to be moved once the mouse is released
    down = false;
}

function handleMouseMove(event) {
    if(down){
        // fetch the mouse position relatively to the whole page
        const x = event.pageX;
        const y = event.pageY;

        // calculate the distance from last known mouse position
        var tx = mouseX - x;
        var ty = mouseY - y;

        // update last known mouse position
        mouseX = x;
        mouseY = y;

        // update the offset values for the drawn view to be translated
        offsetX += tx * (zoomAmount * moveFactorX);
        offsetY -= ty * (zoomAmount * moveFactorY);

        // bounds the view to chosen limits
        offsetX = offsetX > minX ? offsetX : minX;
        offsetX = offsetX < maxX ? offsetX : maxX;
        offsetY = offsetY > minY ? offsetY : minY;
        offsetY = offsetY < maxY ? offsetY : maxY;

        // update the WebGL scene
        drawScene(gl, programInfo, buffers);
    }
}

// assigning the handlers to the corresponding mouse events
canvas.addEventListener("wheel", handleWheel);
canvas.addEventListener("mousedown", handleMouseDown);
document.addEventListener("mouseup", handleMouseUp);
document.addEventListener("mousemove", handleMouseMove);

// variable to store last calculated distance between touches
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

            // update the offset values for the drawn view to be translated
            offsetX += tx * (zoomAmount * moveFactorX);
            offsetY -= ty * (zoomAmount * moveFactorY);

            // bounds the view to chosen limits
            offsetX = offsetX > minX ? offsetX : minX;
            offsetX = offsetX < maxX ? offsetX : maxX;
            offsetY = offsetY > minY ? offsetY : minY;
            offsetY = offsetY < maxY ? offsetY : maxY;

            drawScene(gl, programInfo, buffers);

        } else if(event.touches.length===2) {
            event.preventDefault();

            dist = abs(touches[0].pageX - touches[1].pageX)
                    + abs(touches[0].pageY - touches[1].pageY);

            touchzoom = touchesDist - dist;
            touchzoom *= 10;

            if(touchzoom < 0) {
                
            } else if(touchzoom > 0) {

            }

            touchesDist = dist;

            drawScene(gl, programInfo, buffers);
        }
    }
}

canvas.addEventListener("touchstart", handleTouchStart);
document.addEventListener("touchend", handleTouchEnd);
document.addEventListener("touchmove", handleTouchMove);

function initGL(canvas) {
    
    // initialize the GL context
    const gl = canvas.getContext("webgl");

    // only continue if WebGL is available and working
    if (gl === null) {
        alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        return;
    }

    return gl;
}

// initialize a shader program, so WebGL knows how to draw our data
function initShaderProgram(gl, vsSource, fsSource) {

    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // create the shader program
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // if creating the shader program failed, alert

    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}


// creates a shader of the given type, uploads the source and compiles it.
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // send the source to the shader object

    gl.shaderSource(shader, source);

    // compile the shader program

    gl.compileShader(shader);

    // see if it compiled successfully

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

// create a buffer for the square's positions.
function initBuffers(gl) {

    const positionBuffer = gl.createBuffer();

    // select the positionBuffer as the one to apply buffer operations to from here out.
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

    // now create an array of positions for the square.
    const positions = [
    -1.25,  1.25,
    1.25,  1.25,
    -1.25, -1.25,
    1.25, -1.25,
    ];

    // now pass the list of positions into WebGL to build the
    // shape. We do this by creating a Float32Array from the
    // javaScript array, then use it to fill the current buffer.
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

function drawScene(gl, programInfo, buffers) {
    gl.clearColor(0.1, 0.06, 0.1, 1.0); // clear with chosen color
    gl.clearDepth(1.0);                 // clear everything
    gl.enable(gl.DEPTH_TEST);           // enable depth testing
    gl.depthFunc(gl.LEQUAL);            // near things obscure far things

    // clear the canvas before we start drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // create a perspective matrix, a special matrix that is
    // used to simulate the distortion of perspective in a camera.
    // our field of view is 45 degrees, with a width/height
    // ratio that matches the display size of the canvas
    // and we only want to see objects between 0.1 units
    // and 100 units away from the camera.
    const fieldOfView = 45 * Math.PI / 180;   // in radians
    const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
    const zNear = 0.0;
    const zFar = 5.0;
    const projectionMatrix = mat4.create();

    // note: glmatrix.js always has the first argument
    // as the destination to receive the result.
    mat4.perspective(projectionMatrix,
                    fieldOfView,
                    aspect,
                    zNear,
                    zFar);

    // set the drawing position to the "identity" point, which is
    // the center of the scene.
    const modelViewMatrix = mat4.create();

    // now move the drawing position a bit to where we want to
    // start drawing the square.
    mat4.translate(modelViewMatrix,     // destination matrix
                    modelViewMatrix,     // matrix to translate
                    cameraViewMatrix);  // amount to translate

    mat4.scale(modelViewMatrix,
                modelViewMatrix,
                [aspect, 1.0, 1.0]);

    // tell WebGL how to pull out the positions from the position
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

    // tell WebGL to use our program when drawing
    gl.useProgram(programInfo.program);

    // set the shader uniforms
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.projectionMatrix,
        false,
        projectionMatrix);
    gl.uniformMatrix4fv(
        programInfo.uniformLocations.modelViewMatrix,
        false,
        modelViewMatrix);

    updateUniforms();

    {
        const offset = 0;
        const vertexCount = 4;
        gl.drawArrays(gl.TRIANGLE_STRIP, offset, vertexCount);
    }
}

function main() {
    // set clear color to black, fully opaque
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    // clear the color buffer with specified clear color
    gl.clear(gl.COLOR_BUFFER_BIT);

    drawScene(gl, programInfo, buffers);
}

window.onload = main;
window.onresize = () => drawScene(gl, programInfo, buffers);