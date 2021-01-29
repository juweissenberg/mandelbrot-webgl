const mat4 = glMatrix.mat4;

// fertex shader program
const VS_SOURCE = `
    precision highp float;
    
    attribute vec4 aVertexPosition;
    attribute vec2 aTextureCoord;

    uniform mat4 uModelViewMatrix;
    uniform mat4 uProjectionMatrix;

    varying vec2 vTextureCoord;

    void main(void) {
        gl_Position = uProjectionMatrix * uModelViewMatrix * aVertexPosition;
        vTextureCoord = aTextureCoord;
    }
`;

// fragment shader program
const FS_SOURCE = `
    precision highp float;

    varying vec2 vTextureCoord;

    uniform float uRealAspectRatio;
    uniform vec2 uViewOrigin;
    uniform float uViewRange;
    uniform int uMaxIterations;
    uniform float uEscapeValue;

    void main(void) {

        vec2 uv = vTextureCoord;
        vec2 c = uViewOrigin + ((uv - vec2(0.5)) * (uViewRange));

        float c_real = c[0] * uRealAspectRatio;
        float c_imaginary = c[1];

        float z_real = 0.0;
        float z_imaginary = 0.0;

        float modulus = sqrt(z_real * z_real + z_imaginary * z_imaginary);
        
        int iter = 0;
        for(int i = 0; i < 1000; i++) {
            
            if(i > uMaxIterations) break;

            float nr = z_real * z_real - z_imaginary * z_imaginary + c_real;
            float ni = 2.0 * z_real * z_imaginary + c_imaginary;
            z_real = nr;
            z_imaginary = ni;

            modulus = sqrt(z_real * z_real + z_imaginary * z_imaginary);

            if( modulus > uEscapeValue){
                iter = i;
                break;
            }
        }

        float level = float(iter) / float(uMaxIterations) * 0.8 + 0.1; 

        gl_FragColor = vec4(level, level * 0.6, 0.1, 1.0);
    }
`;

// initial moving speed of the camera
const INIT_MOVE_FACTOR = 0.0052;
// amount of zoom to apply when zooming in the view
const ZOOM_FACTOR = 1.1;
// initial position in space of the view
const INIT_VIEW_ORIGIN = {
    x: 0.0,
    y: 0.0
};
// initial range (multiplier) in space of the view
const INIT_VIEW_RANGE = 8.0;
// initial maximum iteration for the mandelbrot algorithm
const INIT_MAX_ITER = 40;
// initial escape value for the mandelbrot algorithm
const INIT_ESCAPE_VAL = 2.0;

class GLBrot {

    // html canvas document element in which we render the scene
    canvas = null;

    // gl context for rendering if client can provide one
    gl = null;

    // buffers containing the vertices rendered
    buffers = null;

    // shader program constructed from the vertex and fragment shaders defined previously
    shaderProgram = null;

    // object containing the links to the shaders variables
    programInfo = null;

    constructor(canvas){
        this.canvas = canvas;
        this.initGL(this.canvas);
        this.initBuffers(this.gl);
        this.initShaderProgram(VS_SOURCE, FS_SOURCE);
        this.programInfo = {
            program: this.shaderProgram,
            attribLocations: {
                vertexPosition: this.gl.getAttribLocation(this.shaderProgram, 'aVertexPosition'),
                textureCoord: this.gl.getAttribLocation(this.shaderProgram, 'aTextureCoord'),
            },
            uniformLocations: {
                projectionMatrix: this.gl.getUniformLocation(this.shaderProgram, 'uProjectionMatrix'),
                modelViewMatrix: this.gl.getUniformLocation(this.shaderProgram, 'uModelViewMatrix'),
                // actual aspect ratio of the canvas element
                realAspectRatio: this.gl.getUniformLocation(this.shaderProgram, 'uRealAspectRatio'),
                // position where the view is moved to is sent with this link
                viewOrigin: this.gl.getUniformLocation(this.shaderProgram, 'uViewOrigin'),
                // zoom amount to apply to the view is sent with this link
                viewRange: this.gl.getUniformLocation(this.shaderProgram, 'uViewRange'),
                // max iterations for the mandelbrot algorithm is sent with this link
                maxIterations: this.gl.getUniformLocation(this.shaderProgram, 'uMaxIterations'),
                // escape value for the mandelbrot algorithm is sent with this link
                escapeValue: this.gl.getUniformLocation(this.shaderProgram, 'uEscapeValue')
            },
        };
    }

    // aspect ratio of the canvas on the client's screen
    aspectRatio = 1.0;

    // position of the camera
    camera = {
        x: 0.0,
        y: 0.0,
        z: -4.5
    };
    
    // factors determining how fast the view is moved with the mouse
    moveFactor = { 
        x: INIT_MOVE_FACTOR,
        y: INIT_MOVE_FACTOR
    }
    
    // x and y position of the center of the view
    viewOrigin = {
        x: INIT_VIEW_ORIGIN.x,
        y: INIT_VIEW_ORIGIN.y
    }
    
    // current zoom in the view
    viewRange = INIT_VIEW_RANGE;
    
    // maximum iteration for the mandelbrot algorithm
    maxIter = INIT_MAX_ITER;
    
    // escape value for the mandelbrot algorithm
    escapeVal = INIT_ESCAPE_VAL;

    // updates the uniforms values used in the shaders
    updateUniforms() {
        this.gl.uniform2f(this.programInfo.uniformLocations.viewOrigin, 
            this.viewOrigin.x, 
            this.viewOrigin.y
        );
        this.gl.uniform1f(this.programInfo.uniformLocations.viewRange, this.viewRange);
        this.gl.uniform1i(this.programInfo.uniformLocations.maxIterations, this.maxIter);
        this.gl.uniform1f(this.programInfo.uniformLocations.escapeValue, this.escapeVal);
        this.gl.uniform1f(this.programInfo.uniformLocations.realAspectRatio, this.aspectRatio);
    }

    initGL(canvas) {
        
        // initialize the GL context
        this.gl = canvas.getContext("webgl");

        // only continue if WebGL is available and working
        if (this.gl === null) {
            alert("Unable to initialize WebGL. Your browser or machine may not support it.");
        }
    }

    // creates a shader of the given type, uploads the source and compiles it.
    loadShader(type, source) {
        const shader = this.gl.createShader(type);

        // send the source to the shader object

        this.gl.shaderSource(shader, source);

        // compile the shader program

        this.gl.compileShader(shader);

        // see if it compiled successfully

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            alert(
                'An error occurred compiling the shaders: ' 
                + this.gl.getShaderInfoLog(shader)
            );
            this.gl.deleteShader(shader);
            return null;
        }

        return shader;
    }

    // initialize a shader program, so WebGL knows how to draw our data
    initShaderProgram(vsSource, fsSource) {

        const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);
        // create the shader program
        this.shaderProgram = this.gl.createProgram();
        this.gl.attachShader(this.shaderProgram, vertexShader);
        this.gl.attachShader(this.shaderProgram, fragmentShader);
        this.gl.linkProgram(this.shaderProgram);

        // if creating the shader program failed, alert

        if (!this.gl.getProgramParameter(this.shaderProgram, this.gl.LINK_STATUS)) {
            alert(
                'Unable to initialize the shader program: ' 
                + this.gl.getProgramInfoLog(this.shaderProgram)
            );
        }
    }

    // create a buffer for the square's positions.
    initBuffers() {

        const positionBuffer = this.gl.createBuffer();

        // select the positionBuffer as the one to apply buffer operations to from here out.
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);

        // now create an array of positions for the square.
        const positions = [
        -2.0,  2.0,
        2.0,  2.0,
        -2.0, -2.0,
        2.0, -2.0,
        ];

        // now pass the list of positions into WebGL to build the
        // shape. We do this by creating a Float32Array from the
        // javaScript array, then use it to fill the current buffer.
        this.gl.bufferData(this.gl.ARRAY_BUFFER,
                    new Float32Array(positions),
                    this.gl.STATIC_DRAW);

        const textureCoordBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, textureCoordBuffer);

        const textureCoordinates = [
            0.0,  0.0,
            1.0,  0.0,
            0.0,  1.0,
            1.0,  1.0,
        ];

        this.gl.bufferData(
            this.gl.ARRAY_BUFFER, 
            new Float32Array(textureCoordinates),
            this.gl.STATIC_DRAW
        );

        this.buffers =  {
            position: positionBuffer,
            textureCoord: textureCoordBuffer,
        };
    }

    // resets the view to the initial origin and range
    resetView() {
        this.viewOrigin.x = INIT_VIEW_ORIGIN.x;
        this.viewOrigin.y = INIT_VIEW_ORIGIN.y;
        this.viewRange = INIT_VIEW_RANGE;
        this.moveFactor = {
            x: INIT_MOVE_FACTOR,
            y: INIT_MOVE_FACTOR
        };
        this.maxIter = INIT_MAX_ITER;
        this.escapeVal = INIT_ESCAPE_VAL;
        this.drawScene();
    }

    // translates the view in space
    translateView(x, y, z=0.0){
        // update the offset values for the drawn view to be translated
        this.viewOrigin.x += x * this.moveFactor.x;
        this.viewOrigin.y += y * this.moveFactor.y;
        this.drawScene();
    }

    // take the camera closer to the view
    zoomView(direction){
        // check the direction and zoom/dezoom accordingly
        if(direction < 0) {
            this.viewRange /= ZOOM_FACTOR;
            this.moveFactor.x /= ZOOM_FACTOR;
            this.moveFactor.y /= ZOOM_FACTOR;
        } else if(direction > 0){
            this.viewRange *= ZOOM_FACTOR;
            this.moveFactor.x *= ZOOM_FACTOR;
            this.moveFactor.y *= ZOOM_FACTOR;
        }
        this.drawScene();
    }

    // updates the aspect ratio of the canvas
    updateCanvasRatio() {
        this.aspectRatio = this.gl.canvas.clientWidth / this.gl.canvas.clientHeight;
    }

    // render the scene in the canvas
    drawScene() {
        this.gl.clearColor(0.1, 0.06, 0.1, 1.0); // clear with chosen color
        this.gl.clearDepth(1.0);                 // clear everything
        this.gl.enable(this.gl.DEPTH_TEST);           // enable depth testing
        this.gl.depthFunc(this.gl.LEQUAL);            // near things obscure far things

        // clear the canvas before we start drawing on it.
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        // recalculate canvas aspect ratio on screen
        this.updateCanvasRatio();

        // create a perspective matrix, a special matrix that is
        // used to simulate the distortion of perspective in a camera.
        // our field of view is 45 degrees, with a width/height
        // ratio that matches the display size of the canvas
        // and we only want to see objects between 0.0 units
        // and 5.0 units away from the camera.
        const fieldOfView = 45 * Math.PI / 180;   // in radians
        const aspect = this.aspectRatio;
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
                        [this.camera.x, this.camera.y, this.camera.z]);  // amount to translate

        mat4.scale(modelViewMatrix,
                    modelViewMatrix,
                    [aspect, 1.0, 1.0]);

        // tell WebGL how to pull out the positions from the position
        // buffer into the vertexPosition attribute.
        {
            const numComponents = 2;  // pull out 2 values per iteration
            const type = this.gl.FLOAT;    // the data in the buffer is 32bit floats
            const normalize = false;  // don't normalize
            const stride = 0;         // how many bytes to get from one set of values to the next
                                    // 0 = use type and numComponents above
            const offset = 0;         // how many bytes inside the buffer to start from
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.position);
            this.gl.vertexAttribPointer(
                this.programInfo.attribLocations.vertexPosition,
                numComponents,
                type,
                normalize,
                stride,
                offset);
                this.gl.enableVertexAttribArray(
                    this.programInfo.attribLocations.vertexPosition
                );
        }

        // Indiquer à WebGL comment extraire les coordonnées de texture du tampon
        {
            const num = 2; // chaque coordonnée est composée de 2 valeurs
            const type = this.gl.FLOAT; // les données dans le tampon sont des flottants 32 bits
            const normalize = false; // ne pas normaliser
            const stride = 0; // combien d'octets à récupérer entre un jeu et le suivant
            const offset = 0; // à combien d'octets du début faut-il commencer
            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffers.textureCoord);
            this.gl.vertexAttribPointer(
                this.programInfo.attribLocations.textureCoord, 
                num, type, normalize, stride, offset
            );
            this.gl.enableVertexAttribArray(this.programInfo.attribLocations.textureCoord);
        }

        // tell WebGL to use our program when drawing
        this.gl.useProgram(this.programInfo.program);

        // set the shader uniforms
        this.gl.uniformMatrix4fv(
            this.programInfo.uniformLocations.projectionMatrix,
            false,
            projectionMatrix
        );
        this.gl.uniformMatrix4fv(
                this.programInfo.uniformLocations.modelViewMatrix,
            false,
            modelViewMatrix
        );

        this.updateUniforms();

        {
            const offset = 0;
            const vertexCount = 4;
            this.gl.drawArrays(this.gl.TRIANGLE_STRIP, offset, vertexCount);
        }
    }
}

function main() {
    // canvas document element used for WebGL rendering
    let canvas = document.querySelector("#glCanvas");
    
    mandelbrot = new GLBrot(canvas);
    mandelbrot.drawScene();

    // assigning the handlers to the corresponding mouse events
    canvas.addEventListener("wheel", handleWheel);
    canvas.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("mousemove", handleMouseMove);

    // assigning the handlers to the mobile touch events
    canvas.addEventListener("touchstart", handleTouchStart);
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchmove", handleTouchMove);

    // GUI document elements
    const iterSlider = document.getElementById("iter-slider");
    const iterLabel = document.getElementById("iter-label");
    const escapeSlider = document.getElementById("escape-slider");
    const escapeLabel = document.getElementById("escape-label");
    const resetButton = document.getElementById("reset-button");
    const settingsElem = document.getElementById("settings");
    const settingsButton = document.getElementById("settings-button");

    // state of the mouse click
    let down = false;

    // last known position of the mouse
    let mouseX;
    let mouseY;

    function handleWheel(event) {
        mandelbrot.zoomView(event.deltaY);
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
            let tx = mouseX - x;
            let ty = mouseY - y;
            // update last known mouse position
            mouseX = x;
            mouseY = y;
            mandelbrot.translateView(
                tx, 
                ty * mandelbrot.aspectRatio
            );
        }
    }

    // variables to store last calculated distance between touches
    let touchesDist;

    function handleTouchStart(event) {
        // if one finger is touching the view and moving we move the view
        if(event.touches.length === 1 && event.changedTouches.length === 1){
            down = true;
            mouseX = event.touches[0].pageX;
            mouseY = event.touches[0].pageY;
            event.preventDefault();
        // if two fingers are touching the view and moving we zoom in/out the view
        } else if (event.touches.length===2 && event.changedTouches.length > 0) {
            down = true;
            touchesDist = Math.abs(event.touches[0].pageX - event.touches[1].pageX);
                        + Math.abs(event.touches[0].pageY - event.touches[1].pageY);
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
                const x = event.touches[0].pageX;
                const y = event.touches[0].pageY;
                let tx = mouseX - x;
                let ty = mouseY - y;
                mouseX = x;
                mouseY = y;

                mandelbrot.translateView(
                    tx / mandelbrot.aspectRatio,
                    ty
                );
            } else if(event.touches.length === 2 && event.changedTouches.length > 0) {
                dist = Math.abs(event.touches[0].pageX - event.touches[1].pageX);
                        + Math.abs(event.touches[0].pageY - event.touches[1].pageY);
                touchzoom = touchesDist - dist;
                touchesDist = dist;

                mandelbrot.zoomView(touchzoom);
            }
        }
    }

    iterSlider.oninput = () => {
        mandelbrot.maxIter = iterSlider.value;
        iterLabel.textContent = iterSlider.value;
        mandelbrot.drawScene();
    };
    escapeSlider.oninput = () => {
        mandelbrot.escapeVal = parseInt(escapeSlider.value) / 1000.0;
        escapeLabel.textContent = mandelbrot.escapeVal.toString();
        mandelbrot.drawScene();
    };

    function resetHandlers() {
        mandelbrot.resetView();
        iterSlider.value = mandelbrot.maxIter.toString();
        escapeSlider.value = (mandelbrot.escapeVal*1000).toString();
        iterLabel.textContent = mandelbrot.maxIter.toString();
        escapeLabel.textContent = mandelbrot.escapeVal.toString();
    }

    resetButton.addEventListener("click", resetHandlers);
    resetButton.addEventListener("touchstart", resetHandlers);

    function handleSettings() {
        if(settingsElem.classList.contains("settings-visible")){
            settingsElem.classList.remove("settings-visible");
        } else {
            settingsElem.classList.add("settings-visible");
        }
    }
    settingsButton.addEventListener("click", handleSettings);
    settingsButton.addEventListener("touchstart", handleSettings);

    window.onresize = () => mandelbrot.drawScene();
}

window.onload = main;