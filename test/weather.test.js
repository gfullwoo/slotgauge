import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWeather, skyFrom, degToDir } from '../src/weather.js';
import { createApp } from '../server.js';

const J = (o) => ({ ok: true, json: async () => o });
const fake = (calls = []) => async (url) => {
  calls.push(url);
  if (url.includes('/points/')) return J({ properties: { forecast: 'F', forecastHourly: 'H', observationStations: 'S', timeZone: 'America/New_York', relativeLocation: { properties: { city: 'Lewes', state: 'DE' } } } });
  if (url === 'S') return J({ features: [{ properties: { stationIdentifier: 'KGED', name: 'Georgetown' } }] });
  if (url.includes('/observations/latest')) return J({ properties: { timestamp: '2026-10-31T20:00:00+00:00', textDescription: 'Light Rain', icon: 'x/ra', temperature: { value: 17 }, windSpeed: { value: 9.252 }, windDirection: { value: 290 }, barometricPressure: { value: 103013.95 }, relativeHumidity: { value: 36.4 }, visibility: { value: 16093 } } });
  if (url === 'H') return J({ properties: { updateTime: 'u', periods: [{ startTime: 't1', temperature: 58, shortForecast: 'Partly Sunny', icon: 'day/bkn', isDaytime: true, probabilityOfPrecipitation: { value: 0 }, windSpeed: '10 mph', windDirection: 'N' }] } });
  if (url === 'F') return J({ properties: { periods: [{ name: 'Tonight', startTime: 't', isDaytime: false, temperature: 47, shortForecast: 'Partly Cloudy', detailedForecast: 'd', icon: 'night/sct', probabilityOfPrecipitation: { value: 0 }, windSpeed: '5 to 10 mph', windDirection: 'N' }] } });
  return { ok: false, status: 404 };
};

test('sky classification and unit helpers', () => {
  assert.equal(skyFrom('Mostly Sunny'), 'partly'); assert.equal(skyFrom('Clear'), 'clear'); assert.equal(skyFrom('Overcast', 'ovc'), 'cloudy');
  assert.equal(skyFrom('Chance Rain Showers'), 'rain'); assert.equal(skyFrom('Thunderstorms'), 'storm'); assert.equal(skyFrom('Snow'), 'snow'); assert.equal(skyFrom('Fog/Mist'), 'fog');
  assert.equal(degToDir(290), 'WNW'); assert.equal(degToDir(0), 'N');
});

test('weather.at merges observation + forecasts with US units and caches', async () => {
  const calls = []; const w = makeWeather({ fetchImpl: fake(calls) });
  const r = await w.at(38.78, -75.13);
  assert.equal(r.place, 'Lewes, DE'); assert.equal(r.current.tempF, 63); assert.equal(r.current.windMph, 6); assert.equal(r.current.windDir, 'WNW'); assert.equal(r.current.pressureInHg, 30.42);
  assert.equal(r.sky, 'rain'); assert.equal(r.hourly[0].tempF, 58); assert.equal(r.daily[0].name, 'Tonight');
  const n = calls.length; await w.at(38.781, -75.131); assert.equal(calls.length, n);
});

test('/api/weather validates input and serves data', async () => {
  const app = createApp({ wikiLive: false, tidesRefresh: false, weather: makeWeather({ fetchImpl: fake() }) });
  const srv = app.listen(0); const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal((await fetch(`${base}/api/weather`)).status, 400);
    const j = await (await fetch(`${base}/api/weather?lat=38.78&lon=-75.13`)).json();
    assert.equal(j.current.text, 'Light Rain'); assert.equal(j.source, 'National Weather Service');
  } finally { srv.close(); }
});
