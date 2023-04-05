
const mapboxClient = require("@mapbox/mapbox-sdk");
const baseClient = mapboxClient({
  accessToken:
    "pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw",
});
const mapboxMatrixService = require("@mapbox/mapbox-sdk/services/matrix");
const matrixService = mapboxMatrixService(baseClient);

class TimeObjective {


   static findPathWaypoints(path) {
    var pathWaypoints = [];
    for (let p in path) {
      pathWaypoints.push({
        coordinates: [Number(path[p][0]), Number(path[p][1])],
      });
    }
    return pathWaypoints;
  }
  static _get_path(admissibleStations, srcLatitude, srcLongitude) {
    var path = [];
    path.push([srcLongitude, srcLatitude]);

    var T = this.TIME_OBJECTIVE_OPTIONS;
    for (let i = 0; i < admissibleStations.length; i++) {
      if (T === 0) {
        break;
      }

      T--;
      var _evStation = admissibleStations[i]._station;
      path.push([_evStation.position.lon, _evStation.position.lat]);
    }
    return path;
  }

  static async optimizeTimeDistanceMatrix(
    admissibleStations,
    srcLatitude,
    srcLongitude
  ) {

    var path = this._get_path(admissibleStations, srcLatitude, srcLongitude);
    var pathWaypoints = this.findPathWaypoints(path);
    var matrixResponse = await matrixService
      .getMatrix({
        points: pathWaypoints,
        profile: "driving-traffic",
        sources: [
          0
        ],
        annotations:[
          'distance',
          'duration'
        ]
      }).send();
    var response = await matrixResponse.body 
    
    console.log(response);
    var idx = 0, pathT = Number.MAX_SAFE_INTEGER;

    for(let i = 1; i<response.durations[0].length; i++){
        if(response.durations[0][i] < pathT){
          idx = i-1;
          pathT = response.durations[0][i];
        }
    } 
    return admissibleStations[idx]._station
  }

  static async optimize(admissibleStations, srcLatitude, srcLongitude, dstLatitude, dstLongitude){


    if(admissibleStations.length < 1){
       return null
    }
    
    var matrix = await this.optimizeTimeDistanceMatrix(admissibleStations, srcLatitude, srcLongitude)
    console.log(matrix)

    if(matrix != null && matrix != undefined){
      return matrix
    }

    return admissibleStations[matrix]._station

  }
}

module.exports = TimeObjective;
