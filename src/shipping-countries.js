// Matchmate approved shipping matrix dated 2026-10-21.
// Source: storefront shipping-config.mjs. Only country names/codes, no rates.
export const SHIPPING_COUNTRIES=Object.freeze([
  ['US','United States'],['CA','Canada'],['GB','United Kingdom'],
  ['AE','United Arab Emirates'],['AT','Austria'],['AU','Australia'],
  ['BE','Belgium'],['BG','Bulgaria'],['CH','Switzerland'],['CY','Cyprus'],
  ['CZ','Czechia'],['DE','Germany'],['DK','Denmark'],['EE','Estonia'],
  ['ES','Spain'],['FI','Finland'],['FR','France'],['GR','Greece'],
  ['HR','Croatia'],['HU','Hungary'],['IE','Ireland'],['IL','Israel'],
  ['IT','Italy'],['LT','Lithuania'],['LV','Latvia'],['MX','Mexico'],
  ['MY','Malaysia'],['NL','Netherlands'],['NO','Norway'],['NZ','New Zealand'],
  ['PH','Philippines'],['PL','Poland'],['PT','Portugal'],['RO','Romania'],
  ['SA','Saudi Arabia'],['SE','Sweden'],['SG','Singapore'],['SI','Slovenia'],['SK','Slovakia']
].map(([code,name])=>Object.freeze({code,name})));
