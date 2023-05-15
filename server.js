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
  koster: { lat: 58.8663, lon: 11.0076 },
  pejë: {lat: 42.6593, lon: 20.2887},
  copenhagen: { lat: 55.6761, lon: 12.5683 },
  nice: { lat: 43.7102, lon: 7.2620 },
  monaco: { lat: 43.7384, lon: 7.4246 },
  la: { lat:  34.0522, lon: 118.2437}
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
  let data = [];
  for (const location in locations) {
    try {
      const { lat, lon } = locations[location];
      const response = await fetch(`${metApiUrl}?lat=${lat}&lon=${lon}`, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'User-Agent': 'dashboard-app'
        }
      });
      console.log(`${metApiUrl}?lat=${lat}&lon=${lon}`)
      
      if (!response.ok) {
        data.push({ name: location, temperature: 0, symbolCode: 0 });
        console.error(`Error: received status code ${response.status}`);
        continue;
      }
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        console.error(`Error: expected JSON but received ${contentType}`);
        continue;
      }
      
      const jsonData = await response.json();
      const temp = jsonData.properties.timeseries[0].data.instant.details.air_temperature;
      const symbolCode = jsonData.properties.timeseries[0].data.next_1_hours.summary.symbol_code;
      data.push({ name: location, temperature: temp, symbolCode: symbolCode });
    } catch (error) {
      console.error(`Error fetching weather data for ${location}: ${error}`);
    }
  }
  weatherData = data;
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

  try {
    const usdResponse = await fetch(`${exchangeUrl}?base=USD&symbols=NOK`);
    const eurResponse = await fetch(`${exchangeUrl}?base=EUR&symbols=NOK`);
    const usdData = await usdResponse.json();
    const eurData = await eurResponse.json();
    exchangeData.USD = usdData.rates.NOK;
    exchangeData.EUR = eurData.rates.NOK;
  } catch (error) {
    console.error(`Error fetching exchange data: ${error.message}`);
  }
}


fetchWeatherData();
fetchCryptoData();
setInterval(fetchCryptoData, 300000);
setInterval(fetchWeatherData, 1800000);


app.get('/crypto', (req, res) => {
  const cryptoPrices = cryptoSymbols.map(symbol => {
    const { lastPrice } = cryptoData[symbol];
    return { symbol, price: lastPrice };
  });
  
  const exchangeRates = Object.entries(exchangeData).map(([symbol, rate]) => {
    return { symbol, price: rate };
  });
  
  const responseData = [...cryptoPrices, ...exchangeRates];
  
  return res.json(responseData);
});


app.get('/weather', (req, res) => {
    res.json(weatherData);
});

app.get('/news', (req, res) => {
  if (!newsItems) {
    return res.status(503).json({ error: 'News data not yet available' });
  }
  res.json(newsItems);
});


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on port ${PORT}`));

