import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import RSSParser from 'rss-parser';


const app = express();
app.use(express.static('public'));
app.use(cors());

const locations = {
  oslo: { lat: 59.9139, lon: 10.7522 },
  sarpsborg: { lat: 59.2831, lon: 11.1097 },
  copenhagen: { lat: 55.6761, lon: 12.5683 },
  nice: { lat: 43.7102, lon: 7.2620 },
  monaco: { lat: 43.7384, lon: 7.4246 },
};
const apiUrl = "https://api.binance.com/api/v3/ticker/24hr";
const metApiUrl = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const exchangeUrl = "https://api.exchangerate.host/latest";

let cryptoData = {};
let weatherData = {};
let exchangeData = {};
let newsItems;

const cryptoSymbols = ["BTCUSDT", "ETHUSDT", "LTCUSDT"];

async function fetchNews() {
  const rssUrl = 'https://www.nrk.no/nyheter/siste.rss';
  const proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(rssUrl);
  const parser = new RSSParser();
  const response = await fetch(proxyUrl);
  const data = await response.json();
  const feed = await parser.parseString(data.contents);

  newsItems = feed.items.slice(0, 5);
}

fetchNews();
setInterval(fetchNews, 600000)

async function fetchWeatherData() {
  for (const location in locations) {
    try {
      const { lat, lon } = locations[location];
      const response = await fetch(`${metApiUrl}?lat=${lat}&lon=${lon}`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      });
      console.log(`${metApiUrl}?lat=${lat}&lon=${lon}`)
      
      if (!response.ok) {
        weatherData[location] = { temperature: 0, symbolCode: 0 };
        console.error(`Error: received status code ${response.status}`);
        continue;
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error(`Error: expected JSON but received ${contentType}`);
        continue;
      }
      
      const data = await response.json();
      const temp = data.properties.timeseries[0].data.instant.details.air_temperature;
      const symbolCode = data.properties.timeseries[0].data.next_1_hours.summary.symbol_code;
      weatherData[location] = { temperature: temp, symbolCode: symbolCode };
    } catch (error) {
      console.error(`Error fetching weather data for ${location}: ${error}`);
    }
  }
}


async function fetchCryptoData() {
  for (const symbol of cryptoSymbols) {
    try {
      const response = await fetch(`${apiUrl}?symbol=${symbol}`);
      const data = await response.json();
      cryptoData[symbol] = data;
    } catch (error) {
      console.error(`Error fetching data for ${symbol}: ${error.message}`);
    }
  }
}

async function fetchAllData() {
  // Fetch weather and exchange data
  await fetchWeatherData();

  try {
    const usdResponse = await fetch(`${exchangeUrl}?base=USD&symbols=NOK`);
    const eurResponse = await fetch(`${exchangeUrl}?base=EUR&symbols=NOK`);
    exchangeData.USD = await usdResponse.json();
    exchangeData.EUR = await eurResponse.json();
  } catch (error) {
    console.error(`Error fetching exchange data: ${error.message}`);
  }
}

fetchAllData();
fetchCryptoData();
setInterval(fetchCryptoData, 300000);
setInterval(fetchAllData, 21600000);


app.get('/crypto/:symbol', (req, res) => {
  const { symbol } = req.params;
  const data = cryptoData[symbol];
  if (!data) {
    return res.status(404).json({ error: 'Symbol not found' });
  }
  return res.json(data);
});

app.get('/weather/:location', (req, res) => {
  const { location } = req.params;
  const data = weatherData[location];
  if (data) {
    res.json(data);
  } else {
    res.json(data)
  }
});


app.get('/exchange/:base', (req, res) => {
  const { base } = req.params;
  const data = exchangeData[base];
  if (!data) {
    return res.status(404).json({ error: 'Base currency not found' });
  }
  return res.json(data);
});

app.get('/news', (req, res) => {
  if (!newsItems) {
    return res.status(503).json({ error: 'News data not yet available' });
  }
  res.json(newsItems);
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));


