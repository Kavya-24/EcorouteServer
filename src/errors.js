class Errors{


      static ERR_MESSAGE_MATRIX_OPTIMIZATION = "ERR: Could not load matrix statistics";
      static ERR_MESSAGE_NO_STATIONS = "ERR: No stations found";
      static ERR_MESSAGE_FAIL_ROUTE = "ERR: Could not load directional route"

    
      static is_error(response){
          if(typeof(response) === String && response.substring(0,4) == "ERR:"){
              return true
          }
          return false
      }
}

module.exports = Errors