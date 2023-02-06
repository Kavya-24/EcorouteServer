const util = require("./utils");
const err = require("./errors")

const mapboxClient = require("@mapbox/mapbox-sdk");
const baseClient = mapboxClient({
  accessToken:
    "pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw",
});
const mapboxMatrixService = require("@mapbox/mapbox-sdk/services/matrix");
const matrixService = mapboxMatrixService(baseClient);

class TimeObjective {
  static TIME_OBJECTIVE_OPTIONS = 5;
  static MAX_TIME_STATION = 60*60*4; //4 Hours

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

  static optimizeTimeDistanceMatrix(
    admissibleStations,
    srcLatitude,
    srcLongitude
  ) {

    var path = this._get_path(admissibleStations, srcLatitude, srcLongitude);
    var pathWaypoints = this.findPathWaypoints(path);
    matrixService
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
      })
      .send()
      .then((response) => {
        const matrix = response.body;
        console.log(matrix)
        return matrix
      });

    return err.ERR_MESSAGE_TIME_OPTIMIZATION
  }

  static optimize(admissibleStations, srcLatitude, srcLongitude){


    if(admissibleStations.length < 1){
       return err.ERR_MESSAGE_NO_STATIONS
    }
    return admissibleStations[0]._station
    
    var matrix = this.optimizeTimeDistanceMatrix(admissibleStations, srcLatitude, srcLongitude)
    var idx = 0;

    if(matrix === err.ERR_MESSAGE_TIME_OPTIMIZATION){
       return admissibleStations[idx]._station
    }
    


    return admissibleStations[idx]._station

  }
}

module.exports = TimeObjective;
