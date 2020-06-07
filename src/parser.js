'use strict'
const lineData = require('./line_data')

const retailerAliases = {
  Farnell: 'Farnell',
  FEC: 'Farnell',
  Premier: 'Farnell',
  element14: 'Farnell',
  'sn-dk': 'Digikey',
  'Digi(-| )?key': 'Digikey',
  Mouser: 'Mouser',
  RS: 'RS',
  'RS(-| )?Online': 'RS',
  'RS(-| )?Delivers': 'RS',
  'Radio(-| )?Spares': 'RS',
  'RS(-| )?Components': 'RS',
  Newark: 'Newark',
  JLC: 'JLC Assembly',
  'JLC Assembly': 'JLC Assembly',
  LCSC: 'LCSC'
}

const headings = {
  'refs?': 'reference',
  'references?': 'reference',
  'line(-| )?notes?': 'reference',
  //not happy about this one but it's an eagle default in bom.ulp
  parts: 'reference',
  'designators?': 'reference',
  'comments?': 'description',
  'descriptions?': 'description',
  'cmnts?': 'description',
  'descrs?': 'description',
  'qn?tys?': 'quantity',
  quantity: 'quantity',
  quantities: 'quantity',
  'quant.?': 'quantity',
  'co?u?nt': 'quantity',
  pn: 'partNumber',
  'part(-| )?numbers?': 'partNumber',
  'm/?f parts?': 'partNumber',
  'manuf\\.? parts?': 'partNumber',
  'mpns?': 'partNumber',
  'm/?f part numbers?': 'partNumber',
  'manuf\\.? part numbers?': 'partNumber',
  'manufacturer parts?': 'partNumber',
  'manufacturer part numbers?': 'partNumber',
  'prts?': 'partNumber',
  'manuf#': 'partNumber',
  'ma?n?fr part.*': 'partNumber',
  mfpn: 'partNumber',
  'mfg.?part.*': 'partNumber',
  'retail\\.? part no\\.?': 'retailerPart',
  'retailer part number': 'retailerPart',
  'suppl\\.? part no\\.?': 'retailerPart',
  'supplier part number': 'retailerPart',
  'supplier part': 'retailerPart',
  'part no\\.?': 'retailerPart',
  'part number\\.?': 'retailerPart',
  'retailers?': 'retailer',
  'retail\\.?': 'retailer',
  'suppliers?': 'retailer',
  'suppl\\.?': 'retailer',
  fitted: 'fitted',
  fit: 'fitted',
  stuff: 'fitted',
  'do not fit': 'notFitted',
  'do not stuff': 'notFitted',
  dnf: 'notFitted',
  dns: 'notFitted',
  'values?': 'value',
  'voltages?': 'voltage',
  'volt.?': 'voltage',
  '.*power.*': 'power',
  'footprints?': 'footprint',
  'manufacturers?': 'manufacturer',
  'm/?f': 'manufacturer',
  'manuf\\.?': 'manufacturer',
  'mfg.': 'manufacturer'
}

function parse(input, options = {}) {
  return parseTSV(input)
}

function parseTSV(input) {
  return read(input)
}

function read(input) {
  const warnings = []
  const aoa = input
    .split('\n')
    .filter(l => l !== '')
    .map(line => line.split('\t'))
  return toLines(aoa, warnings)
}

function toLines(aoa, warnings) {
  let hs = aoa[0].map(x => lookup(x, headings) || lookup(x, retailerAliases))

  if (hs.indexOf('quantity') < 0) {
    return {
      lines: [],
      invalid: [{row: 1, reason: 'No quantity column'}]
    }
  }
  if (hs.indexOf('reference') < 0) {
    return {
      lines: [],
      invalid: [{row: 1, reason: 'No references column'}]
    }
  }

  const number_of_mpns = hs.filter(h => h === 'partNumber').length
  const number_of_manufacturers = hs.filter(h => h === 'manufacturer').length

  if (number_of_mpns !== number_of_manufacturers) {
    return {
      lines: [],
      invalid: [
        {
          row: 1,
          reason:
            'Number of manufacturers does not match number of manufacturer part numbers.'
        }
      ]
    }
  }

  let i = 0
  hs = hs.map(x => {
    if (x === 'manufacturer') {
      return `manufacturer_${i}`
    }
    if (x === 'partNumber') {
      const h = `partNumber_${i}`
      i += 1
      return h
    }
    return x
  })

  const lines = aoa
    .slice(1)
    .map(a => {
      const line = {}
      for (const key of hs) {
        const index = hs.indexOf(key)
        const v = a[index]
        line[key] = v
      }
      return line
    })
    .map(processLine.bind(null, warnings))
    .filter(l => l.quantity > 0)
    .filter(l => l.fitted)
  return {lines, warnings, invalid: []}
}

function processLine(warnings, line, i) {
  const newLine = lineData.getEmptyLine()
  newLine.row = i + 1
  const manufacturers = []
  const parts = []
  const retailers = []
  const retailerParts = []
  for (const key in line) {
    const v = stripQuotes(line[key].trim())
    if (lineData.retailer_list.indexOf(key) >= 0) {
      if (key === 'Digikey') {
        newLine.retailers[key] = v
      } else {
        newLine.retailers[key] = v.replace(/-/g, '')
      }
    } else if (/^manufacturer_/.test(key)) {
      manufacturers.push(v)
    } else if (/^partNumber_/.test(key)) {
      parts.push(v)
    } else if (key === 'retailer') {
      retailers.push(lookup(v, retailerAliases))
    } else if (key === 'retailerPart') {
      retailerParts.push(v)
    } else if (key === 'quantity') {
      let q = parseInt(v, 10)
      if (isNaN(q) || q <= 0) {
        warnings.push({
          title: 'Invalid quantity',
          message: `Row ${i} has an invalid quantity: ${v}. Removing this line.`
        })
        q = 0
      }
      newLine.quantity = q
    } else if (key === 'notFitted') {
      newLine.fitted =
        /^0$/.test(v) ||
        /false/i.test(v) ||
        /^fitted$/i.test(v) ||
        /^fit$/i.test(v) ||
        /^stuff$/i.test(v) ||
        /^stuffed$/i.test(v)
    } else if (key === 'fitted') {
      newLine.fitted = !(
        /^0$/i.test(v) ||
        /false/i.test(v) ||
        /not/i.test(v) ||
        /dn(f|s)/i.test(v)
      )
    } else {
      newLine[key] = v
    }
  }
  newLine.partNumbers = parts.map((part, i) => {
    return {part, manufacturer: manufacturers[i] || ''}
  })
  // handle retailer/part columns
  retailerParts.forEach((part, i) => {
    const r = retailers[i]
    if (r !== 'Digikey') {
      part = part.replace(/-/g, '')
    }
    if (r) {
      newLine.retailers[r] = part
    }
  })
  if (newLine.fitted == null) {
    newLine.fitted = true
  }
  if (newLine.description == '') {
    newLine.description += newLine.value ? newLine.value + ' ' : ''
    newLine.description += newLine.voltage ? newLine.voltage + ' ' : ''
    newLine.description += newLine.power ? newLine.power + ' ' : ''
    newLine.description += newLine.footprint ? newLine.footprint + ' ' : ''
    newLine.description = newLine.description.trim()
  }
  delete newLine.value
  delete newLine.voltage
  delete newLine.power
  delete newLine.footprint
  return newLine
}

//a case insensitive match
function lookup(name, obj) {
  for (const key in obj) {
    const re = RegExp(key, 'i')
    if (name.match(re)) {
      return obj[key]
    }
  }
  //else
  return null
}

function stripQuotes(str) {
  let ret = str
  if (ret[0] === '"' || ret[0] === "'") {
    ret = ret.substr(1)
  }
  const last = ret.length - 1
  if (ret[last] === '"' || ret[last] === "'") {
    ret = ret.substr(0, last)
  }
  return ret
}

exports.parseTSV = parseTSV
exports.parse = parse
exports.stripQuotes = stripQuotes
