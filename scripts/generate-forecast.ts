import { runForecastModelImproved } from '../lib/model/index';
import * as fs from 'fs';
import * as path from 'path';

const forecast = runForecastModelImproved();
const outputPath = path.join(process.cwd(), 'data/forecast.json');

fs.writeFileSync(outputPath, JSON.stringify(forecast, null, 2));
console.log('Forecast generated successfully');
console.log(JSON.stringify(forecast, null, 2));
