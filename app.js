const express = require("express");

const port = 3000;
const app = express();

app.use(express.static("public"));

app.listen(port, () => {
    console.log("[INFO]: Server started on port " + port);
})