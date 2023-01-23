const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const fs = require("fs");
const fetch = require("./fetchtimeout");
const turf = require("@turf/turf");
const Util = require("./utils");

const app = express();

app.use(helmet());

app.use(bodyParser.json());

app.use(cors());

app.get("/", (req, res) => {
  res.send("Welcome to Ecoroute Server....");
});

app.get("/getallstations", function (req, res) {
  fs.readFile(
    __dirname + "./../assets/" + "EV_STATION_DATA.json",
    "utf8",
    function (err, data) {
      res.end(data);
    }
  );
});

let rawdata = fs.readFileSync("../assets/EV_STATION_DATA.json");
let chargingStationsData = JSON.parse(rawdata);
chargingStationsData = Object.values(chargingStationsData);

/**
 * use one or more query parameters (city, postalCode)
 * the endpoint returns the union of these parameters 
 * Sample Query: http://localhost:6001/chargingstations?postalCode=122003 
 */
app.get("/chargingStations", (req, res) => {
  const city = req.query.city;
	const postalCode = req.query.postalCode; 

	let reqChargingStations = chargingStationsData;
	if(city) {
		city = city.toLowerCase();
		reqChargingStations = reqChargingStations.filter(
			(c) => c.address.municipality.toLowerCase() === city || c.address.countrySecondarySubdivision.toLowerCase() === city || c.address.countrySubdivision.toLowerCase() === city
		);
	}
	if(postalCode) {
		reqChargingStations = reqChargingStations.filter(
			(c) => c.address.postalCode === postalCode
		);
	}
  res.send(reqChargingStations);
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

  if(lat === undefined){
    res.send("Add Point Latitude")
  }

  if(lon === undefined){
    res.send("Add Point Longitude")
  }
  
  if(radius === undefined){
    radius = 50000
  }

  console.log(`Request parameters: Lat=${lat}, Lon=${lon}, Radius=${radius}`);
  var from = turf.point([lon, lat]);
  var options = {units: 'meters'};

  let reqChargingStations = [];
  for(let i=0; i < chargingStationsData.length; i++){
      var c = chargingStationsData[i];
      var to = turf.point([c.position.lon, c.position.lat]);
      var distance = turf.distance(from, to, options);
      if(distance <= radius){
        reqChargingStations.push(c)
      } 
  }
  console.log(reqChargingStations)
  res.send(reqChargingStations);
  
});


/**
 * Wrapper API for getting the desired results for User
 * Inputs:Lat1, Lon1, Lat2,Lon2, SOC
 * Sample Query: http://localhost:6001/ecoroutePath?lat1=28.6304&lon1=77.2177&lat2=28.5673&lon2=77.3211&soc=10
 * By default, SOC = full-charge = 100%
 */
app.get("/ecoroutePath", (req, res) => {
  
  const srcLatitude = req.query.lat1;
  const srcLongitude = req.query.lon1;
  const dstLatitude = req.query.lat2;
  const dstLongitude = req.query.lon2;
  var soc= req.query.soc;
  
  if(srcLatitude === undefined){
    res.send("Add Source Latitude")
  }
  
  if(srcLongitude === undefined){
    res.send("Add Source Longitude")
  }
  
  if(dstLatitude === undefined){
    res.send("Add Destination Latitude")
  }
  
  if(dstLongitude === undefined){
    res.send("Add Destination Longitude")
  }

  
  if(soc === undefined){
    soc = 100
  }


  console.log(`\n\nRequest parameters: Source: Lat=${srcLatitude}, Lon=${srcLongitude}, Destination: Lat=${dstLatitude}, Lon=${dstLongitude}, SOC=${soc} `);
  
  var stops = new Set() //Stations that are part of the path
  var path = []

  ecorouteIsochone(srcLatitude,srcLongitude,dstLatitude,dstLongitude,soc, res,1, stops, path)

});

async function ecorouteIsochone(srcLatitude, srcLongitude, dstLatitude, dstLongitude, soc, res, steps, stops, path){
  
  
  path.push([srcLongitude, srcLatitude])
  var URL = Util.getIsochroneURL(srcLatitude, srcLongitude, soc)
  console.log(`\nFinding the isochrone for ${URL}`)
  
  fetch(URL, { method: "GET" }, 15000) 
    .then((response) => response.json())
    .then((response) => {
      
      var foundInDestination = Util.destinationPresentInBoundingBox(dstLatitude, dstLongitude, response, chargingStationsData);

      console.log(`Isochrone found. Finding point: ${dstLongitude}, ${dstLatitude} in the boundingPolygon. ${foundInDestination}`)
      if(foundInDestination === true){

        path.push([dstLongitude, dstLatitude]);        
        console.log(`Destination found in the current isochrone. Number of steps = ${steps}. Path size= ${path.length}`);
        
        return findDirectionRoute(path, res, steps)
      }
      else if(foundInDestination === false){

        var nextChargingStation = Util.findAdmissibleChargingStation(srcLatitude, srcLongitude, response, chargingStationsData, dstLatitude, dstLongitude, stops)
        if(nextChargingStation == null || nextChargingStation === undefined){
          console.log("Unable to find appropriate charging stations")
        }
        else{
          
          stops.add(nextChargingStation)
          return ecorouteIsochone(nextChargingStation.position.lat, nextChargingStation.position.lon, dstLatitude, dstLongitude, 100, res, steps+1, stops, path)
        }
      }
      else{
        console.log("Unable to compute destination in isochrone")
      }
      
      console.log("Iteration of isochrone = " + steps)
      res.send("Successfully recovered");

    })
    .catch((e) => {
      res.send(`Unable to find isochrone for ${srcLongitude}, ${srcLatitude}`)
    });
}

async function findDirectionRoute(path, res, steps){
  
  
  //The path has the lon,lat of all the favourable things
  var URL = Util.getDirectionsURL(path)
  console.log(`\nFinding the navigation route for ${URL}`)
  
  fetch(URL, { method: "GET" }, 15000) 
    .then((response) => response.json())
    .then((response) => {
      
      res.send(response)

    })
    .catch((e) => {
      res.send(`Unable to find navigational route`)
    });
    
}

const port = process.env.PORT || 6001;

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
