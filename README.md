# Gospel Hall Directory

A searchable directory of UK and Irish Brethren (Gospel Hall) assemblies, published at **https://andyrabel.github.io/gospelhall**.

## What it does

Displays assembly contact information fetched live from five published Google Sheets — one per country (England, N Ireland, Scotland, Wales, Eire). No data is stored by the site; every page load fetches fresh from the source sheets.

## Structure

```
index.html   — markup and privacy notice modal
style.css    — styles (no frameworks)
app.js       — CSV fetch, parse, render, search, modal
```

## Data sources

Each sheet has the columns: `County | City | (blank) | Name | Address | Post Code | Tel | Email | URL`

| Country    | Sheet |
|------------|-------|
| England    | [link](https://docs.google.com/spreadsheets/d/e/2PACX-1vTZfpOzIGbg36vju4h7--bbJ53m2pfJJ7Cn2PjpwSpyfv7THDszsoTZp2B9uJ5uFbB5uUyH_FQZT4dL/pub?output=csv) |
| N Ireland  | [link](https://docs.google.com/spreadsheets/d/e/2PACX-1vRye2Q6sEoXjHnT1UoABZzXNYzOQNy5YBTSW7p2peB9OIpnM4ZUGqVEAxLKnJAy-PhDAO8O6R0_7BVJ/pub?output=csv) |
| Scotland   | [link](https://docs.google.com/spreadsheets/d/e/2PACX-1vQShOy13HBRBLEoA4sAug-_wyzlnSBllx4YOpGHIHKqIZo8HrU8dJMgf08ixOBWJazPMffIl6oOhRXd/pub?output=csv) |
| Wales      | [link](https://docs.google.com/spreadsheets/d/e/2PACX-1vTYQtYCkn2S6vurTDz3ng4skf_w17L7Sz3yvb2J0dd049ARR8-ua5xrpCZ64FrkWrebZKr5FGYD0hzL/pub?output=csv) |
| Eire       | [link](https://docs.google.com/spreadsheets/d/e/2PACX-1vTeUtxu_aXeW_Ngyy69vZQEU0MFjTLCiKiynm-jQjhNmzGUfZ0GYYyOzQpbUKOfo8xaW0QOBMAdDwXO/pub?output=csv) |

To update assembly information, edit the relevant Google Sheet directly — changes appear on the site immediately.

## Removing personal details (GDPR / data requests)

If someone asks for their personal contact details (phone number, email address) to be removed:

1. Open the relevant country's Google Sheet
2. Find their row and clear the Tel and/or Email cells
3. The site will reflect the change on the next page load — no redeploy needed

The privacy notice (accessible via the footer link on the site) asks people to email `CONTACT_EMAIL_PLACEHOLDER` for removal requests. Update that placeholder in `index.html` before publishing.

## Hosting

Published via GitHub Pages from the `main` branch root. Any push to `main` redeploys automatically within a minute or two.

## Privacy

- No cookies, no tracking, no analytics
- No visitor data is collected or stored
- Personal data displayed is sourced from the Google Sheets maintained by assembly representatives
- UK GDPR applies; Republic of Ireland falls under EU GDPR
- Supervisory authorities: [ICO](https://ico.org.uk) (UK) and [DPC](https://dataprotection.ie) (Ireland)
