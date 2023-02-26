const mapboxClient = require("@mapbox/mapbox-sdk");

const baseClient = mapboxClient({
  accessToken:
    "pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw",
});

const mapboxMatrixService = require("@mapbox/mapbox-sdk/services/matrix");
const mapboxDirectionService =   require("@mapbox/mapbox-sdk/services/directions");


const matrixService = mapboxMatrixService(baseClient);
const directionService = mapboxDirectionService(baseClient);

module.exports = {
    matrixService: matrixService, 
    directionService: directionService
}

