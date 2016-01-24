import mapbox from "mapbox-gl"

class Map {

  constructor($container, accessToken) {
    console.log($container);
    mapbox.accessToken = accessToken;
    console.log("kfjdlskjgfd");
    this.$container = $container;
  }

  init($container) {
    this.map = new mapbox.Map({
      container: this.$container,
      style: "mapbox://styles/stubennett/cijizel74006xb3m1tjsvyk7h",
      center: [-74.50, 40], // starting position
      zoom: 9, // starting zoom,
      width: "100%"
    });

    this.map.on("style.load", () => {

      this.map.addSource('single-point', {
      	"type": "geojson",
	"data": {
	  "type": "FeatureCollection",
	  "features": []
	}
      });

      this.map.addLayer({
	  "id": "point",
	  "source": "single-point",
	  "type": "circle",
	  "paint": {
	    "circle-radius": 10,
	    "circle-color": "#007cbf"
          }
        });


      });
  }

  markLocation(lat, lng) {
    let data = {
      "type": "Feature",
      "geometry": {
	"type": "Point",
	"coordinates": [lat, lng]
      }
    };
    console.log(data);
    this.map.getSource("single-point").setData(data);
  }    
}

export default Map;

