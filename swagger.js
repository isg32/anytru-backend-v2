const swaggerAutogen = require('swagger-autogen')();
const config = require('./src/config/config');

const doc = {
	info: {
		title: 'My API',
		description: 'Description'
	},
	host: `localhost:${config.port}`
};

const outputFile = './src/utils/swagger-output.json';
const routes = ['./index.js'];

/* NOTE: If you are using the express Router, you must pass in the 'routes' only the 
root file where the route starts, such as index.js, app.js, routes.js, etc ... */

swaggerAutogen(outputFile, routes, doc);
