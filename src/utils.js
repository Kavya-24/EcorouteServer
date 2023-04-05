const turf = require("@turf/turf");
const time_coefficient = require("./timeobjective");
const energy_coefficient = require("./energyobjective");
const mapboxClient = require("@mapbox/mapbox-sdk");
const baseClient = mapboxClient({
  accessToken:
    "pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw",
});
const mapboxDirectionService = require("@mapbox/mapbox-sdk/services/directions");
const directionService = mapboxDirectionService(baseClient);

class Util {
  static distanceOptions = { units: "kilometers" };
  static STATION_COUNT = 5;
  static SCALE_ALPHA = 0.5;

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

  static printFn(p_station) {
    console.log('"' + p_station._station.poi.name + '",');
    console.log(
      "[" +
        [p_station._station.position.lat, p_station._station.position.lon] +
        "],"
    );
  }

  static getBoundingPolygon(coordinates) {
    var polygonCoordinates = [];
    for (let i = 0; i < coordinates.length; i++) {
      polygonCoordinates.push([coordinates[i][0], coordinates[i][1]]);
    }

    return turf.polygon([polygonCoordinates]);
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

  static line_distance(_srcPoint, _dstPoint, _stationPoint) {
    const midpoint = turf.midpoint(_srcPoint, _dstPoint);
    return turf.distance(_stationPoint, midpoint, this.distanceOptions);
  }
  static cost_function(_srcPoint, _dstPoint, _stationPoint) {
    var cost_gn = turf.distance(_srcPoint, _stationPoint, this.distanceOptions);
    var cost_hn = turf.distance(_dstPoint, _stationPoint, this.distanceOptions);
    var cost_ln = this.line_distance(_srcPoint, _dstPoint, _stationPoint);
    return { _gn: cost_gn, _hn: cost_hn, _ln: cost_ln };
  }

  static sortStations(a, b) {
    const weightSource = 0.1; // prioritize distance to source over distance to destination
    const weightDestination = 0.5;
    const weightLine = 0.4;
    var aScore =
      weightSource * a._cost_object._gn +
      weightDestination * a._cost_object._hn +
      weightLine * a._cost_object._ln;
    var bScore =
      weightSource * b._cost_object._gn +
      weightDestination * b._cost_object._hn +
      weightLine * b._cost_object._ln;
    return aScore - bScore;
  }

  static findStationsInIsochrone(
    chargingStationsData,
    boundingPolygon,
    stops,
    srcPoint,
    dstPoint,
    evCar
  ) {
    var stationsInQueue = [];
    var connectable_station = false;

    for (var i = 0; i < chargingStationsData.length; i++) {
      var c = chargingStationsData[i];
      connectable_station = false;

      for (var connector in c["chargingPark"]["connectors"]) {
        if (
          evCar.carConnector.includes(
            c["chargingPark"]["connectors"][connector]["connectorType"]
          )
        ) {
          connectable_station = true;
          break;
        }
      }

      if (!connectable_station) {
        continue;
      }

      if (
        turf.booleanPointInPolygon(
          turf.point([c.position.lon, c.position.lat]),
          boundingPolygon
        )
      ) {
        var cost_object = this.cost_function(
          srcPoint,
          dstPoint,
          turf.point([
            this.coordinate_parse(c.position.lon),
            this.coordinate_parse(c.position.lat),
          ])
        );

        if (stops.has(c) === false) {
          stationsInQueue.push({ _cost_object: cost_object, _station: c });
        }
      }
    }

    stationsInQueue.sort(this.sortStations);
    console.log("Stations found: " + stationsInQueue.length);

    return stationsInQueue;
  }

  static destinationPresentInBoundingBox(_lat, _lon, isochroneResponse) {
    var destinationPoint = turf.point([_lon, _lat]);
    var boundingPolygon = this.getBoundingPolygon(
      isochroneResponse.features[0].geometry.coordinates[0]
    );
    return turf.booleanPointInPolygon(destinationPoint, boundingPolygon);
  }

  static coordinate_parse(str) {
    return parseFloat(str).toFixed(8);
  }


  static soc_consumption(
    initial_soc,
    srcLatitude,
    srcLongitude,
    evCar,
    path_response,
    measure
  ) {
    var consumption_distance = path_response.weights.weights.total_distance;
    var scale_consumption = evCar.carBatterCapacity / evCar.carMileage;
    var total_consumption = consumption_distance * scale_consumption; //consumption in kwh
    var total_soc = evCar.carBatterCapacity * (initial_soc / 100); //soc in kwh

    if (total_soc < total_consumption) {
      return 0;
    }
    var final_soc =
      ((total_soc - total_consumption) / evCar.carBatterCapacity) * 100;
    return final_soc;
  }

  static async format_availability_request(path_responses,soc, evCar){

    /**for all the optimal stations in order, I want to request in the designated format */
    // {
    //   "start_time" : 300,
    //   "end_time" : 400,
    //   "cs_queue": ["dBK-On6XfGWQECVAxzUyxg"],
    //   "soc" : 10,
    //   "battery_capacity":61,
    //   "mileage":300,
    //   "connectors":["StandardHouseholdCountrySpecific"]
    //   }

    

  }
  static async request_appropriate_station(path_responses,soc, measure, evCar) {    

    // fetch("https://ev-scheduler-zlj6.onrender.com", {
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     key1: "value1",
    //     key2: "value2",
    //   }),
    // })
    //   .then((response) => response.json())
    //   .then((data) => {
        
    //   })
    //   .catch((error) => {
        
    //   });


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
      .send();
    var response = await directionResponse.body;
    return response;
  }

  static step_weight(measure, directions) {
    var _weight_ = 0,
      step_distance = 0,
      step_duration = 0,
      step;
    for (let l = 0; l < directions.routes[0].legs.length; l++) {
      for (let s = 0; s < directions.routes[0].legs[l].steps.length; s++) {
        step = directions.routes[0].legs[l].steps[s];
        step_distance += step.distance;
        step_duration += step.duration;

        if (measure === "energy") {
          _weight_ +=
            step.distance *
            this.extract_point_cost(step.maneuver.type) *
            this.SCALE_ALPHA;
        } else if (measure === "time") {
          _weight_ +=
            step.duration *
            this.extract_point_cost(step.maneuver.type) *
            this.SCALE_ALPHA;
        }
      }
    }
    return {
      total_distance: step_distance,
      total_duration: step_duration,
      total_weight: _weight_,
    };
  }


  static sortOptimalStations(a, b) {
    var aWeight = a.weights.total_weight;
    var bWeight = b.weights.total_weight;
    return aWeight - bWeight;
  }

  static async optimizeObjectives(
    admissibleStations,
    srcLatitude,
    srcLongitude,
    dstLatitude,
    dstLongitude,
    evCar,
    measure,
    soc
  ) {
    var T = this.STATION_COUNT;
    var path = [];
    var path_responses = [];
    for (let i = 0; i < admissibleStations.length; i++) {
      if (T === 0) {
        break;
      }

      T--;

      path = [];
      let _evStation = admissibleStations[i]._station;

      path.push([srcLongitude, srcLatitude]);
      path.push([_evStation.position.lon, _evStation.position.lat]);
      var path_response = await this.intermediateRoute(path);
      path_responses.push({
        _station: _evStation,
        _response: path_response,
        weights: this.step_weight(measure, path_response),
      });
    }

    path_responses.sort(this.sortOptimalStations);

    return await this.request_appropriate_station(path_responses,soc,measure,evCar);
  }

  static async findAdmissibleChargingStation(
    srcLatitude,
    srcLongitude,
    isochroneResponse,
    chargingStationsData,
    dstLatitude,
    dstLongitude,
    stops,
    measure,
    evCar,
    soc
  ) {
    var srcPoint = turf.point([srcLongitude, srcLatitude]);
    var dstPoint = turf.point([dstLongitude, dstLatitude]);

    var boundingPolygon = this.getBoundingPolygon(
      isochroneResponse.features[0].geometry.coordinates[0]
    );

    var admissibleStations = this.findStationsInIsochrone(
      chargingStationsData,
      boundingPolygon,
      stops,
      srcPoint,
      dstPoint,
      evCar
    );

    if (admissibleStations.length < 1) {
      return null;
    }

    if (measure === "unoptimized") {
      console.log("\n\nUnOptimized Metric: ");
      this.printFn(admissibleStations[0]);
      return admissibleStations[0]._station;
    }

    var optimal_station = await this.optimizeObjectives(
      admissibleStations,
      srcLatitude,
      srcLongitude,
      dstLatitude,
      dstLongitude,
      evCar,
      measure,
      soc
    );
    // return optimal_station
    return admissibleStations[0]._station;
  }
}

/**
 * http://localhost:6001/ecoroutePath?lat1=28.6304&lon1=77.2177&lat2=26.9124&lon2=75.7873&soc=10&measure=petrol
 * Query helpers
 * Rajiv Chowk : lat1=28.6304&lon1=77.2177
 * DLF Mall : lat2=28.5673&lon2=77.3211
 * OCP: lat2=28.4901&lon2=77.5143
 * IITP: lat2=25.5376569&lon2=84.8481432
 * Patna Airport: 25.5950° N, 85.0908° E
 */

module.exports = Util;
