const err = require("./errors");

const mapboxClient = require("@mapbox/mapbox-sdk");
const baseClient = mapboxClient({
  accessToken:
    "pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw",
});
const mapboxDirectionService = require("@mapbox/mapbox-sdk/services/directions");
const directionService = mapboxDirectionService(baseClient);

const mapboxTilequeryService = require("@mapbox/mapbox-sdk/services/directions");
const tilequeryService = mapboxTilequeryService(baseClient);

class EnergyObjective {
  static ENERGY_OBJECTIVE_OPTIONS = 3;
  static SCALE_ALPHA = 5;

  static extract_point_cost(_turn_) {
    switch (_turn_) {
      case "turn":
        return 0.2;
      case "depart":
        return 0.2;
      case "arrive":
        return 0.2;
      case "merge":
        return 0.1;
      case "on ramp":
        return 0.2;
      case "off ramp":
        return -0.1;
      case "fork":
        return 0.1;
      case "roundabout":
        return 0.1;
      case "exit roundabout":
        return 0.2;
      case "end of road":
        return 0.2;
      case "new name":
        return 0.2;
      case "continue":
        return -0.2;
      case "rotary":
        return 0.2;
      case "roundabout turn":
        return 0.2;
      case "notification":
        return 0.2;
      case "exit rotary":
        return 0.2;
      default:
        return 0.2;
    }
  }

  static findPathWaypoints(path) {
    var pathWaypoints = [];
    for (let p in path) {
      pathWaypoints.push({
        coordinates: [Number(path[p][0]), Number(path[p][1])],
      });
    }
    return pathWaypoints;
  }

  static step_weight(directions) {
    var _weight_ = 0,
      step;
    for (let l = 0; l < directions.routes[0].legs.length; l++) {
      for (let s = 0; s < directions.routes[0].legs[l].steps.length; s++) {
        step = directions.routes[0].legs[l].steps[s];
        _weight_ += step.distance + this.extract_point_cost(step.maneuver.type);
      }
    }

    return _weight_;
  }

  static height_weight(directions) {
    return 0;
  }

  static async intermediateRoute(path) {
    var pathWaypoints = this.findPathWaypoints(path);
    var directionResponse = await directionService
      .getDirections({
        profile: "driving-traffic",
        waypoints: pathWaypoints,
        steps: true,
        bannerInstructions: true,
      })
      .send()
    var response = await directionResponse.body
    return this.step_weight(response) + this.height_weight(response);
  }

  static async optimizeTurnsHeight(admissibleStations, srcLatitude, srcLongitude) {
    var T = this.ENERGY_OBJECTIVE_OPTIONS;
    var path = []
    var idx = 0, pathW =  Number.MAX_SAFE_INTEGER
    for (let i = 0; i < admissibleStations.length; i++) {
      if (T === 0) {
        break;
      }

      T--;

      path = [];
      let _evStation = admissibleStations[i]._station;

      path.push([srcLongitude, srcLatitude]);
      path.push([_evStation.position.lon, _evStation.position.lat]);

      var path_weight = await this.intermediateRoute(path);
      if(path_weight < pathW){
        idx = i;
        pathW = path_weight
      }
    }
    return admissibleStations[idx]._station;
  }

  static async optimize(admissibleStations, srcLatitude, srcLongitude) {
    if (admissibleStations.length < 1) {
      return err.ERR_MESSAGE_NO_STATIONS;
    }
    

    var matrix = await this.optimizeTurnsHeight(
      admissibleStations,
      srcLatitude,
      srcLongitude
    );

    console.log(matrix)
    if(matrix != null && matrix != undefined){
      return matrix
    }

    return admissibleStations[0]._station;
  }
}

module.exports = EnergyObjective;
