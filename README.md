# EcorouteServer
EcoRoute Server


## Ownership of files/functions:

Kavya:
1. energyObjectives.js
2. timeObjective.js
3. utils.js
4. fetchtimeout.js
5. interfaces.js
6. errors.js
_(Need to remove useless files)_

Aradhya:
1. firebase.js
2. firebaseAdmin.json



Common:
1. EV_STATION_DATA.json : Only data
2. mapboxServices.js    : Objects for async call of mapbox (refactor where needed)
3. index.js             : entry-points
    <br>
    Kavya:                          <br>
    ---/stationsInVicinity          <br>
    ---/ecoroutePath                <br>
    ---function ecorouteIsochone    <br>
    ---function reserve_station     <br>
    ---function findDirectionRoute  <br>

    Aradhya:
    ---/getallstations              <br>
    ---/chargingStations            <br>
    ---/getPathV1                   <br>
    ---/getPathV2                   <br>
    ---/getHeatmapData              <br>
    Rest is boilerplate setup, some constants and data references




