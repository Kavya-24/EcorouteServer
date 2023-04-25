const turf = require("@turf/turf");
const time_coefficient = require("./timeobjective");
const energy_coefficient = require("./energyobjective");
const fetch = require("node-fetch");
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

    // for(var i =0; i< stationsInQueue.length; i++){
    //   this.printFn(stationsInQueue[i])
    // }

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

  /* returns final soc after travelling and just reaching charging station */
  static soc_consumption(
    initial_soc,
    evCar,
    path_response
  ) {

    console.log(path_response)
    
    var consumption_distance = path_response._response.routes[0].distance / 1000;
    
    var scale_consumption = evCar.carBatterCapacity / evCar.carMileage;
    var total_consumption = consumption_distance * scale_consumption; //consumption in kwh
    var total_soc = evCar.carBatterCapacity * (initial_soc / 100); //soc in kwh

    // console.log(`For the station with id: ${path_response._station.id} and soc at source as ${initial_soc} and distance = ${consumption_distance}`)
    // console.log( `It traels for ${evCar.carBatterCapacity} kwh per ${evCar.carMileage} km`)
    // console.log(`Therefore, it will consume: ${total_consumption} kwh`)
    // console.log(`The initial soc units is given by ${total_soc}`)
    
    if (total_soc < total_consumption) {
      return 0;
    }
    var final_soc =
      ((total_soc - total_consumption) / evCar.carBatterCapacity) * 100;
    console.log(final_soc)
    return final_soc;
  }

  /* returns final soc after charging */
  static soc_gained(initial_soc, charging_time, evCar){

      var time_taken = 45*60
      if(evCar.carChargerType === "Normal"){ time_taken = 60*60}
      if(evCar.carChargerType === "Slow"){ time_taken = 90*60}
      
      if(charging_time >= time_taken){
        return {final_soc : 100, time_taken : time_taken}
      }

      return {final_soc: (100 * ( charging_time)) / time_taken , time_taken : charging_time }

  }

  static format_date_minutes(current_unix, source_unix){

    
    const original_midnight = Math.floor(source_unix / 86400) * 86400;
    const elapsed_seconds = current_unix - original_midnight;
    const elapsed_minutes = Math.floor(elapsed_seconds / 60);

    // console.log(`CurrentUnix=${current_unix}, SourceUnix=${source_unix}`)
    // console.log(`OriginalMidnight ${original_midnight}`)    
    // console.log(`Elapsed min-sec ${elapsed_minutes} and ${elapsed_seconds}`)

    return elapsed_minutes;

  }

  static format_station_response(node_state, path_responses, idx, charging_time,port,evCar, station_request_id){

    var station_reached_time = node_state.node_time + path_responses[idx]._response.routes[0].duration;
    var soc_change = this.soc_gained(node_state.node_exit_soc,charging_time,evCar);
    console.log(`\nReached this station at ${station_reached_time} and charged in ${soc_change.time_taken}`)

    return {station: path_responses[idx]._station, 
      node_state:   {
                      node_soc    :  this.soc_consumption(node_state.node_exit_soc,evCar,path_responses[idx]), 
                      node_time   :  station_reached_time + charging_time,
                      source_time :  node_state.source_time,
                      node_exit_soc : soc_change.final_soc

                    },
      charger_state:{
                      entry_time: station_reached_time,
                      exit_time : station_reached_time + soc_change.time_taken,
                      exit_soc  : soc_change.final_soc,
                      port      : port,
                      request_id: station_request_id
                    }
      
    };
  }

  static format_availability_request(path_responses,node_state, charging_time,evCar){


    var requestJSON =   
    { "start_time":  [], 
      "end_time": [], 
      "cs_queue": [], 
      "battery_capacity":0,
      "connectors":[]
    }


    requestJSON["battery_capacity"] = evCar.carBatterCapacity;
    for(var i=0; i<evCar.carConnector.length; i++){
        requestJSON["connectors"].push(evCar.carConnector[i])
    }

    


    for(var i=0; i< path_responses.length; i++){  
        var station_response = path_responses[i];
        var station_reached_time = node_state.node_time + station_response._response.routes[0].duration;
        requestJSON["start_time"].push(this.format_date_minutes(station_reached_time, node_state.source_time));
        requestJSON["end_time"].push(this.format_date_minutes(station_reached_time + charging_time,node_state.source_time));
        requestJSON["cs_queue"].push(station_response._station.id);
    }

    return requestJSON;

  }
  static async request_appropriate_station(path_responses,node_state, measure, evCar) {    

    var charging_time = 7200;
    if(measure === 'time'){
      charging_time = 3600;
    } 
    var requestJSON = this.format_availability_request(path_responses,node_state,charging_time,evCar) 
    
    console.log(requestJSON)

    const response = await fetch("https://ev-scheduler-zlj6.onrender.com/check", { 
      method : "POST",
      headers: {
                "Content-Type": "application/json",
              },
      body   : JSON.stringify(requestJSON)});

    const data = await response.json();
    console.log(data)

    if(data === null || data === undefined || data == undefined || data.success === 0){
      return this.format_station_response(node_state,path_responses,0,charging_time,0,evCar,null);
    }

    else{
      var station_id = data.station_id;
      var station_port = data.port
      console.log(`Found the station ${station_id} with port ${station_port}`);

      var idx = 0

      for(var i=0; i<path_responses.length; i++){
        if(path_responses[i]._station.id === station_id){
          idx = i;
          break;
        }
      }
      return this.format_station_response(node_state,path_responses,idx,charging_time,station_port,evCar,data.id);
    }

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
    node_state
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


    if(measure === "unoptimized"){
      return this.format_station_response(node_state,path_responses,0,10800,0,evCar,null);
    }
  

    path_responses.sort(this.sortOptimalStations);


    return await this.request_appropriate_station(path_responses,node_state,measure,evCar);
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
    node_state
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

    var optimal_station = await this.optimizeObjectives(
      admissibleStations,
      srcLatitude,
      srcLongitude,
      dstLatitude,
      dstLongitude,
      evCar,
      measure,
      node_state
    );
    
    return optimal_station;
    
  }
}

/**
 * Query helpers
 * Rajiv Chowk : lat1=28.6304&lon1=77.2177
 * DLF Mall : lat2=28.5673&lon2=77.3211
 * OCP: lat2=28.4901&lon2=77.5143
 * IITP: lat2=25.5376569&lon2=84.8481432
 * Patna Airport: 25.5950° N, 85.0908° E
 */

module.exports = Util;
