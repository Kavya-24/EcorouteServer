const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const fetch = require("./fetchtimeout");
const turf = require("@turf/turf");
const Fuse = require("fuse.js");
const util = require("./utils");
const err = require('./errors')
const interfaces = require("./interfaces");

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
 * By default, the radius is 50km. The value to be given is in meter(s)
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
    radius = 50000;
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
 * Inputs:Lat1, Lon1, Lat2,Lon2, SOC
 * Sample Query: http://localhost:6001/ecoroutePath?lat1=28.6304&lon1=77.2177&lat2=28.5673&lon2=77.3211&soc=10
 * //Delhi-Mumbai Query: http://localhost:6001/ecoroutePath?lat1=28.6304&lon1=77.2177&lat2=19.0760&lon2=72.8777&soc=10&measure=time
 * By default, SOC = full-charge = 100%
 */
app.get("/ecoroutePath", (req, res) => {
  const srcLatitude = req.query.lat1;
  const srcLongitude = req.query.lon1;
  const dstLatitude = req.query.lat2;
  const dstLongitude = req.query.lon2;
  var measure = req.query.measure;
  var soc = req.query.soc;

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
    measure = "energy";
  }

  console.log(
    `\n\nRequest parameters: Source: Lat=${srcLatitude}, Lon=${srcLongitude}, Destination: Lat=${dstLatitude}, Lon=${dstLongitude}, SOC=${soc} and measure=${measure} `
  );

  var path = [];
  var stops = new Set(); //Stations that are part of the path

  if (measure === "petrol") {
    path.push([srcLongitude, srcLatitude]);
    path.push([dstLongitude, dstLatitude]);
    return findDirectionRoute(path, res, 1);
  }

  return ecorouteIsochone(
    srcLatitude,
    srcLongitude,
    dstLatitude,
    dstLongitude,
    soc,
    res,
    1,
    stops,
    path,
    measure
  );
});

function ecorouteIsochone(
  srcLatitude,
  srcLongitude,
  dstLatitude,
  dstLongitude,
  soc,
  res,
  steps,
  stops,
  path,
  measure
) {

    path.push([srcLongitude, srcLatitude]);
    var URL = interfaces.getIsochroneURL(srcLatitude, srcLongitude, soc);
    console.log(`\nFinding the isochrone for ${URL}`);

    fetch(URL, { method: "GET" }, 15000)
      .then((response) => response.json())
      .then((response) => {
        var foundInDestination = util.destinationPresentInBoundingBox(
          dstLatitude,
          dstLongitude,
          response
        );

        console.log(
          `Isochrone found. Is point: ${dstLongitude}, ${dstLatitude} present in the boundingPolygon? = ${foundInDestination}`
        );

        if (foundInDestination === true) {
          path.push([dstLongitude, dstLatitude]);
          console.log(
            `Destination found in the current isochrone. Number of steps = ${steps}. Path size= ${path.length}`
          );
          return findDirectionRoute(path, res, steps);
        } else if (foundInDestination === false) {
          var nextChargingStation = util.findAdmissibleChargingStation(
            srcLatitude,
            srcLongitude,
            response,
            chargingStationsData,
            dstLatitude,
            dstLongitude,
            stops,
            measure
          );  

          if (
            nextChargingStation == null ||
            nextChargingStation === null ||
            nextChargingStation === undefined ||
            err.is_error(nextChargingStation)
          ) {

            res.end(
              "ERR: Unable to find appropriate charging stations"
            );

          } else {
            stops.add(nextChargingStation);
            
            return ecorouteIsochone(
              nextChargingStation.position.lat,
              nextChargingStation.position.lon,
              dstLatitude,
              dstLongitude,
              100,
              res,
              steps + 1,
              stops,
              path,
              measure
            );
          }
        } else {
          res.end("ERR: Unable to find destination in isochrone");
        }
      })
      .catch((e) => {
        console.log(`Unable to find isochrone. Error thrown: ${e}`);
        res.end(
          `ERR: Unable to find isochrone for ${srcLongitude}, ${srcLatitude}`
        );
      });

}


function findDirectionRoute(path, res, steps) {
  
  var resultantPath = []
  for(let p = 0; p < path.length; p++){
    resultantPath.push({
      "lat" : path[p][1],
      "lon" : path[p][0]
    })
  }
  res.send(resultantPath)
}


const port = process.env.PORT || 6001;

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
