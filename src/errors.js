class Errors{


      static ERR_MESSAGE_TIME_OPTIMIZATION = "ERR: Could not load time statistics";
      static ERR_MESSAGE_ENERGY_OPTIMIZATION = "ERR: Could not load analytics statistics"
      static ERR_MESSAGE_NO_STATIONS = "ERR: No stations found";
      static ERR_MESSAGE_FAIL_ROUTE = "ERR: Could not load directional route"

    
      static is_error(response){
          if(response.startsWith("ERR:")){ 
            return true
          }
          return false
      }
}

module.exports = Errors