const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const fetchtimeout = require("./fetchtimeout");
const turf = require("@turf/turf");
const Fuse = require("fuse.js");
const util = require("./utils");
const err = require("./errors");
const interfaces = require("./interfaces");
const fetch = require("node-fetch");
const { directionService } = require("./mapboxServices");
const db = require("./firebase");
const { spawn } = require("child_process");

const app = express();

app.use(helmet());

app.use(bodyParser.json());

app.use(cors());

app.get("/", (req, res) => {
  res.send("Welcome to Ecoroute Server....");
});

app.get("/getallstations", function (req, res) {
  fs.readFile(
    __dirname + "/EV_STATION_DATA.json",
    "utf8",
    function (err, data) {
      res.send(data);
    }
  );
});

let rawdata = fs.readFileSync(__dirname + "/EV_STATION_DATA.json");
let chargingStationsData = JSON.parse(rawdata);
chargingStationsData = Object.values(chargingStationsData);

/**
 * use one or more query parameters (city, postalCode, text, maxEntries)
 * the endpoint returns the intersection of these parameters
 * Sample Query: http://localhost:6001/chargingstations?postalCode=122003
 */
app.get("/chargingStations", (req, res) => {
  try {
    let city = req.query.city;
    let postalCode = req.query.postalCode;
    let name = req.query.name;
    let maxEntries = 10;

    if (req.query.maxEntries) {
      maxEntries = req.query.maxEntries;
    }

    let reqChargingStations = chargingStationsData;

    let options = {
      includeScore: true,
      keys: [],
    };

    if (city) {
      options.keys.push(
        "address.municipality",
        "address.countrySecondarySubdivision",
        "address.countrySubdivision",
        "address.municipalitySubdivision"
      );
    }

    if (postalCode) {
      options.keys.push("address.postalCode");
    }

    if (name) {
      options.keys.push("poi.name", "address.freeformAddress");
    }

    console.log(options);

    const fuse = new Fuse(reqChargingStations, options);

    var result = new Set();
    if (city) {
      let r1 = fuse.search(city);
      for (var i of r1) {
        result.add(i);
      }
    }

    if (name) {
      let r1 = fuse.search(name);
      for (var i of r1) {
        result.add(i);
      }
    }

    if (postalCode) {
      let r1 = fuse.search(postalCode);
      for (var i of r1) {
        result.add(i);
      }
    }

    console.log(result.size);

    let r = [];
    let mx = parseInt(maxEntries);
    for (var i of result) {
      r.push(i);
      mx--;
      if (mx === 0) break;
    }
    console.log("Result size = " + r.length);
    res.send(r);
  } catch (e) {
    res.send(e);
  }
});

/**
 * API for getting the stations within a distance d from a point (LatLng)
 * Sample Query: http://localhost:6001/stationsInVicinity?lat=25.5376569&lon=84.8481432&radius=300000
 * By default, the radius is 100km. The value to be given is in meter(s)
 */
app.get("/stationsInVicinity", (req, res) => {
  const lat = req.query.lat;
  const lon = req.query.lon;
  var radius = req.query.radius;

  if (lat === undefined) {
    res.end("ERR: Add Point Latitude");
  }

  if (lon === undefined) {
    res.end("ERR: Add Point Longitude");
  }

  if (radius === undefined) {
    radius = 100000;
  }

  console.log(`Request parameters: Lat=${lat}, Lon=${lon}, Radius=${radius}`);
  var from = turf.point([lon, lat]);
  var options = { units: "meters" };

  let reqChargingStations = [];
  for (let i = 0; i < chargingStationsData.length; i++) {
    var c = chargingStationsData[i];
    var to = turf.point([c.position.lon, c.position.lat]);
    var distance = turf.distance(from, to, options);
    if (distance <= radius) {
      reqChargingStations.push(c);
    }
  }
  res.send(reqChargingStations);
});

/**
 * Wrapper API for getting the desired results for User
 * ecoroutePath?lat1=29.96046257019043&lon1=77.54252624511719&lat2=27.1780948638916&lon2=78.02179718017578&soc=64&measure=energy&evcar={"carAge":250,"carBatterCapacity":50,"carChargerType":"Normal","carConnector":["GBT20234Part2","IEC62196Type3","IEC62196Type2CableAttached","IEC62196Type2CCS","IEC60309DCWhite"],"carMileage":50,"carName":"Tesla1"}
 * http://localhost:6001/ecoroutePath?lat1=28.632980346679688&lon1=77.21929168701172&lat2=28.645992279052734&lon2=77.33332061767578&soc=50&measure=energy&evcar={"carAge":250,"carBatterCapacity":50,"carChargerType":"Normal","carConnector":["GBT20234Part2","IEC62196Type3","IEC62196Type2CableAttached","IEC62196Type2CCS","IEC60309DCWhite"],"carMileage":50,"carName":"Tesla1"}
 * https://ecoroute-server-ka.onrender.com/ecoroutePath?lat1=28.632980346679688&lon1=77.21929168701172&lat2=28.645992279052734&lon2=77.33332061767578&soc=100&measure=energy&evcar={"carAge":250,"carBatterCapacity":50,"carChargerType":"Normal","carConnector":["GBT20234Part2","IEC62196Type3","IEC62196Type2CableAttached","IEC62196Type2CCS","IEC60309DCWhite"],"carMileage":50,"carName":"Tesla1"}
 * 
 *  
 * Majestic-Whitefield 
 * http://localhost:6001/ecoroutePath?lat1=12.9767&lon1=77.5713&lat2=12.9698&lon2=77.7500&soc=10&measure=energy&evcar={%22carAge%22:59,%22carBatterCapacity%22:78,%22carChargerType%22:%22Normal%22,%22carConnector%22:[%22IEC62196Type3%22,%22IEC62196Type2CableAttached%22,%22IEC60309DCWhite%22],%22carMileage%22:484,%22carName%22:%22zban%22}
 * 
 * Hyderabad-Telangana
 * http://localhost:6001/ecoroutePath?lat1=17.3850&lon1=78.4867&lat2=17.43602&lon2=78.51935&soc=10&measure=energy&evcar={%22carAge%22:59,%22carBatterCapacity%22:78,%22carChargerType%22:%22Normal%22,%22carConnector%22:[%22IEC62196Type3%22,%22IEC62196Type2CableAttached%22,%22IEC60309DCWhite%22],%22carMileage%22:484,%22carName%22:%22zban%22}
 * 
 * 
 * Path that gives station
 * http://localhost:6001/ecoroutePath?lat1=28.632980346679688&lon1=77.21929168701172&lat2=28.464277267456055&lon2=77.50794219970703&soc=63&measure=energy&evcar={%22carAge%22:59,%22carBatterCapacity%22:78,%22carChargerType%22:%22Normal%22,%22carConnector%22:[%22IEC62196Type3%22,%22IEC62196Type2CableAttached%22,%22IEC60309DCWhite%22],%22carMileage%22:484,%22carName%22:%22zban%22}
 */
app.get("/ecoroutePath", async (req, res) => {
  const srcLatitude = req.query.lat1;
  const srcLongitude = req.query.lon1;
  const dstLatitude = req.query.lat2;
  const dstLongitude = req.query.lon2;

  var measure = req.query.measure;
  var soc = req.query.soc;
  const evCarJson = req.query.evcar;

  if (srcLatitude === undefined) {
    res.end("ERR: Add Source Latitude");
  }

  if (srcLongitude === undefined) {
    res.end("ERR: Add Source Longitude");
  }

  if (dstLatitude === undefined) {
    res.end("ERR: Add Destination Latitude");
  }

  if (dstLongitude === undefined) {
    res.end("ERR: Add Destination Longitude");
  }

  if (soc === undefined) {
    soc = 100;
  }

  if (measure === undefined) {
    measure = "unoptimized";
  }

  if (evCarJson === undefined) {
    res.end("ERR: NO EV Car Configuration Found");
  }

  const evCar = JSON.parse(evCarJson);
  const date_object = new Date();
  var current_timestamp = Math.floor(date_object.getTime() / 1000);
  var node_state = {node_soc: soc, node_time : current_timestamp, source_time: current_timestamp, node_exit_soc : soc}
  
  console.log(
    `\n\nRequest parameters: Source: Lat=${srcLatitude}, Lon=${srcLongitude}, Destination: Lat=${dstLatitude}, Lon=${dstLongitude}, and measure=${measure} and EVCar =`
  );
  console.log(evCar);
  console.log(node_state);

  var path = [];
  var stops = new Set(); //Stations that are part of the path
  var booked_station_data = []
  var source_dst = {}
  source_dst.src = [srcLatitude, srcLongitude]
  source_dst.dst = [dstLatitude,dstLongitude]
  source_dst.srcState = node_state
  source_dst.evCar = evCar
  

  if (measure === "petrol") {
    path.push([srcLongitude, srcLatitude]);
    path.push([dstLongitude, dstLatitude]);
    var resultantPath = await findDirectionRoute(path,booked_station_data,measure,source_dst);
    res.send(resultantPath);
  } else {

    var resultantPath = await ecorouteIsochone(
      srcLatitude,
      srcLongitude,
      dstLatitude,
      dstLongitude,
      node_state,
      1,
      stops,
      booked_station_data,
      path,
      measure,
      evCar,
      source_dst
    );

    res.send(resultantPath);
  }
});

async function ecorouteIsochone(
  srcLatitude,
  srcLongitude,
  dstLatitude,
  dstLongitude,
  node_state,
  steps,
  stops,
  booked_station_data,
  path,
  measure,
  evCar,
  source_dst
) {

  path.push([srcLongitude, srcLatitude]);

  if (path.length >= 20) {
    return "ERR: Too long path";
  }


  var URL = interfaces.getIsochroneURL(srcLatitude, srcLongitude, node_state.node_exit_soc);
  console.log(`\nERR: Finding the isochrone for ${URL}`);

  const isochrone_response = await fetch(URL, { method: "GET" });
  if (
    isochrone_response === null ||
    isochrone_response === undefined ||
    isochrone_response == undefined
  ) {
    return "ERR: Unable to find isochrone";
  }

  const isochrone_data = await isochrone_response.json();

  if (
    isochrone_data === null ||
    isochrone_data === undefined ||
    isochrone_data == undefined ||
    isochrone_data.features == undefined
  ) {
    return "ERR: Unable to find isochrone";
  }

  var foundInDestination = util.destinationPresentInBoundingBox(
    dstLatitude,
    dstLongitude,
    isochrone_data
  );

  if (foundInDestination === true) {
    path.push([dstLongitude, dstLatitude]);
    console.log(
      `ERR: Destination found in the current isochrone. Number of steps = ${steps}. Path size= ${path.length}`
    );
    return findDirectionRoute(path, booked_station_data,measure, source_dst);
  } else if (foundInDestination === false) {
    var nextChargingStation = await util.findAdmissibleChargingStation(
      srcLatitude,
      srcLongitude,
      isochrone_data,
      chargingStationsData,
      dstLatitude,
      dstLongitude,
      stops,
      measure,
      evCar,
      node_state
    );

    if (
      nextChargingStation === null ||
      nextChargingStation === null ||
      nextChargingStation === undefined ||
      nextChargingStation == undefined
    ) {
      return "ERR: Unable to find appropriate charging stations";
    } else {
      stops.add(nextChargingStation.station);
      
      booked_station_data.push({station : nextChargingStation.station, node_state : nextChargingStation.node_state, charger_state : nextChargingStation.charger_state})


      const isochrone_child_response = await ecorouteIsochone(
        nextChargingStation.station.position.lat,
        nextChargingStation.station.position.lon,
        dstLatitude,
        dstLongitude,
        nextChargingStation.node_state,
        steps + 1,
        stops,
        booked_station_data,
        path,
        measure,
        evCar,
        source_dst
      );
      return isochrone_child_response;
    }
  } else {
    return "ERR: Unable to find destination in isochrone";
  }
}

async function reserve_station(booked_station_data, measure){

  if(measure === "unoptimzed"){ return;}
  if(booked_station_data.length < 1){ return; }

  var book_stations = { "request_id" : []}

  for(var i = 0; i<booked_station_data.length; i++){
      if(booked_station_data[i].request_id === null){ return; }
      book_stations["request_id"].push(booked_station_data[i].charger_state.request_id)
  }

  console.log("\n\n\n")
  console.log(book_stations)
  
  const response = await fetch("https://ev-scheduler-zlj6.onrender.com/confirm", { 
      method : "POST",
      headers: {
                "Content-Type": "application/json",
              },
      body   : JSON.stringify(book_stations)});

  try{
    const data = await response.json();
    console.log('Reserve-station-confirmation')
    console.log(data)
  } catch{
    console.log('failed-to-reserve-stations')
  }
  
  
  
  return  
}

async function log_route(path,booked_station_data, measure, source_dst){
  

  var route_parameters = {}
  route_parameters.src = source_dst.src                                     //lat,long format
  route_parameters.dst = source_dst.dst                                     //lat,long format
  
  route_parameters.initial_soc = source_dst.srcState.node_exit_soc          //percentage of initial source state
  route_parameters.initial_timestamp = source_dst.srcState.node_time        //unix time stamp of start

  route_parameters.path = path

  route_parameters.stations = []                                            //each station has entry
  for(var i=0; i<booked_station_data.length; i++){
    var c = booked_station_data[i]
    route_parameters.stations.push({lat: c.station.position.lat, lon: c.station.position.lon , entry_time: c.node_state.node_time })
  }

  route_parameters.car = source_dst.evCar                                   //the car that has been used

  console.log("ROUTE-LOG: Route: ")
  console.log(route_parameters)

  const jsonRoute= JSON.stringify(route_parameters);
  const fileContent = fs.readFileSync('route_log.json', 'utf-8');
  const jsonArray = fileContent ? JSON.parse(fileContent) : [];
  jsonArray.push(JSON.parse(jsonRoute));

  fs.writeFileSync('route_log.json', JSON.stringify(jsonArray), 'utf-8');

  
}
async function findDirectionRoute(path, booked_station_data, measure, source_dst) {
  
  reserve_station(booked_station_data, measure)
  log_route(path,booked_station_data, measure, source_dst)

  var resultantPath = [];
  for (let p = 0; p < path.length; p++) {
    resultantPath.push({
      lat: path[p][1],
      lon: path[p][0],
    });
  }

  console.log("\n\n=======request finished=======\n\n")
  return resultantPath;
}

app.get("/getPathV1", async (req, res) => {
  let srcLong = req.query.srcLong;
  let srcLat = req.query.srcLat;
  let destLong = req.query.destLong;
  let destLat = req.query.destLat;

  let url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${srcLong},${srcLat};${destLong},${destLat}?geometries=geojson&access_token=pk.eyJ1Ijoia2F2eWEtMjQiLCJhIjoiY2w2Y2xhc2JpMW80MjNrcDNuZ3hwdDVxNSJ9.yRixm6cK2FVMVYiBk8AbDw`;

  const response = await fetch(url, { method: "GET" });
  const data = await response.json();

  res.send(data);
});

/**
 * Returns path between source and destination
 * takes source and destination coordinates as query parameters
 * sample: http://localhost:6001/getPathV2?srcLong=-84.518641&srcLat=39.134270&destLong=-84.512023&destLat=39.102779
 */
app.get("/getPathV2", async (req, res) => {
  let srcLong = Number(req.query.srcLong);
  let srcLat = Number(req.query.srcLat);
  let destLong = Number(req.query.destLong);
  let destLat = Number(req.query.destLat);

  directionService
    .getDirections({
      profile: "driving-traffic",
      waypoints: [
        {
          coordinates: [srcLong, srcLat],
        },
        {
          coordinates: [destLong, destLat],
        },
      ],
      geometries: "geojson",
    })
    .send()
    .then((response) => {
      const directions = response.body;
      res.send(directions);
    });
});

const round = (coords) => {
  return [parseFloat(coords[0].toFixed(5)), parseFloat(coords[1].toFixed(5))];
};

app.get("/getHeatmapData", async (req, res) => {
  let startdate = req.query.start;
  let enddate = req.query.end;
  // console.log(startdate, enddate);
  dict = {};
  data = [];
  const snapshot = await db.collection("paths").where("date", ">=", startdate).where("date", "<=", enddate).get();
  snapshot.forEach((doc) => {
    d = doc.data();
    ds = d.source;
    dd = d.destination;
    if (round(ds) in dict) {
      dict[round(ds)] += 1;
    } else {
      dict[round(ds)] = 1;
    }
    if (round(dd) in dict) {
      dict[round(dd)] += 1;
    } else {
      dict[round(dd)] = 1;
    }
  });
  Object.keys(dict).forEach((k) => {
    data.push({
      coordinates: k.split(","),
      weight: dict[k],
    });
  });
  console.log(data);
  res.send(data);
});

app.get("/getOsmnxGraphNodes", (req, res) => {
  const lat = req.query.lat;
  const lon = req.query.lon;

  let dataToSend = "no data from python file.";

  const python = spawn("python", ["C:/Users/Aradhya/Desktop/BTP/EcorouteServer/src/osmnx_nodes.py", lat, lon]);
  
  python.stdout.on("data", function (data) {
    console.log("Pipe data from python script ...");
    dataToSend = data.toString();
  });
  
  python.stderr.on("data", (data) => console.log(data.toString()))
  
  python.on("close", (code) => {
    console.log(`child process close all stdio with code ${code}`);
    // send data to browser
    let cords = dataToSend.split('\n');
    if(cords.length > 1) cords.pop();
    cords = cords.map(c => c.substring(0, c.length-1))
    cords = cords.map(c => c.split(' '))
    cords = cords.map(c => [parseFloat(c[0]), parseFloat(c[1])])
    res.send(cords);
  });
});

const port = process.env.PORT || 6001;

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
