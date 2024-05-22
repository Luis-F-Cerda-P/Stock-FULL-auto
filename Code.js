// link a la hoja: https://docs.google.com/spreadsheets/d/10-Y2oNty9s66rskMrJ-XARkoX11tk1g5108vbLvLv54/edit#gid=939148300
function onOpen() {
  SpreadsheetApp.getUi() // Or DocumentApp or SlidesApp or FormApp.
    // TODO: Acción "Ingreso desde Factura" con submenú "Bsale", "Sii"
    .createMenu('Acciones')
    .addItem('Cargar Factura Bsale', 'bsaleLink')
    .addItem('Cargar Factura Sii', 'siiLink')
    .addToUi();
}

function include(fileName) {
  return HtmlService.createHtmlOutputFromFile(fileName).getContent()
}

function showDialog(bsaleData) {
  var html = HtmlService.createTemplateFromFile('Page')
  var code = html.getCode();
  Logger.log(code)

  html.data = bsaleData

  const output = html.evaluate()
    .setWidth(1000)
    .setHeight(600);
  SpreadsheetApp.getUi() // Or DocumentApp or SlidesApp or FormApp.
    .showModalDialog(output, 'Ingreso al inventario de FULL⚡');
}

function bsaleLink() {
  var ui = SpreadsheetApp.getUi(); // Same variations.

  var result = ui.prompt(
    'Cargar factura desde documento de Bsale:',
    'Por favor ingresa el link a la factura:',
    ui.ButtonSet.OK_CANCEL);

  // Process the user's response.
  var button = result.getSelectedButton();
  var text = result.getResponseText();
  if (button == ui.Button.OK) {
    // User clicked "OK".
    const url = text;
    const rawBsaleData = getTheDataFromBsale(url)
    const catalogData = getCatalogData();
    const bsaleData = makeBsaleDataAccountForVariations(rawBsaleData, catalogData)

    showDialog(bsaleData)
    // const url = text;
    // El código a partir de esta línea se debe reemplazar por la función que trabaja con la data de BSale 
    // var textResponse = UrlFetchApp.fetch(url, { 'muteHttpExceptions': true }).getContentText();
    // const $ = Cheerio.load(textResponse);
    // const theHtml = $("#doc_preview_foot").first().html();
    // const theTable = Cheerio.load(theHtml)
    // Logger.log(theTable.text());
    // ui.alert(theTable.text());

  } else if (button == ui.Button.CANCEL) {
    // User clicked "Cancel".
    ui.alert('I didn\'t get your name.');
  } else if (button == ui.Button.CLOSE) {
    // User clicked X in the title bar.
    ui.alert('You closed the dialog.');
  }
}

function captureSubstring(inputString, startString, endString) {
  const startIndex = inputString.indexOf(startString);
  if (startIndex === -1) {
    // Start string not found
    return null;
  }

  // Find the position of the end string after the start string
  const endIndex = inputString.indexOf(endString, startIndex + startString.length);
  if (endIndex === -1) {
    // End string not found after the start string
    return null;
  }

  // Extract the substring between the start and end strings
  const capturedSubstring = inputString.substring(startIndex + startString.length, endIndex - 24);
  return capturedSubstring;

}

function getTheDataFromBsale(urlOfDocument) {
  // el 12vo div dentro del div.header_0 trae la fecha de emisión de la factura
  function intToCurrencyString(number) {
    const formattedNumber = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP'
    }).format(number);

    return formattedNumber
  }
  function currencyStringToInt(inputString) {
    return parseInt(inputString.replace(/[^\d]/g, ''));
  }

  function percentageStringToFloat(percentageString) {
    // Remove "%" character and convert to float
    const floatValue = parseFloat(percentageString.replace('%', ''));
    // Divide by 100 to get the decimal representation
    return floatValue / 100;
  }

  function billDescriptionToInventoryDescription(inputString) {
    const sliceEnd = inputString.indexOf(" --")
    if (sliceEnd === -1) {
      return inputString
    } else {
      return inputString.slice(0, sliceEnd)
    }
  }

  // const url = "http://app2.bsale.cl/view/10259/8521b41dfa7e";
  const url = urlOfDocument;
  const response = UrlFetchApp.fetch(url);
  const textResponse = response.getContentText();
  const captureStart = "var html = '";
  const captureEnd = "<button class=\"print_preview_btn force-hidden\"";
  const captured = captureSubstring(textResponse, captureStart, captureEnd);
  const withoutEscaped = captured.toString().replaceAll("\\n", "\n").replaceAll("\\/", "/").replaceAll("\\\"", "\"").replaceAll("\\'", "'")
  const $ = Cheerio.load(withoutEscaped);
  const dataMembrete = []
  const membrete = $("div.header_0 div")
  membrete.each(function (i, elem) {
    dataMembrete[i] = $(this).text();
  });
  const fechaEmision = dataMembrete[11]
  const nroFactura = dataMembrete[13];
  const date = new Date(); // Create a new Date object, which defaults to the current date and time
  const hours = date.getHours().toString().padStart(2, "0"); // Get the hours component of the date
  const minutes = date.getMinutes().toString().padStart(2, "0"); // Get the minutes component of the date
  const horaCarga = hours + ":" + minutes + ":" + "00";

  const itemsInTable = $("tr.detail_list label");
  const data = []
  itemsInTable.each(function (i, elem) {
    data[i] = $(this).text();
  });

  const processedData = {
    documentInfo: {
      fechaEmision,
      nroFactura,
      horaCarga,
    },
    items: [],
  }

  for (let i = 0, subI = 0; subI < data.length; i++, subI += 6) {
    const quantity = parseInt(data[subI].trim());
    const petcounter_sku = data[subI + 1];
    const petcounter_desc = billDescriptionToInventoryDescription(data[subI + 2]);
    const cost = currencyStringToInt(data[subI + 3]);
    const discount = percentageStringToFloat(data[subI + 4]);
    const net_cost = Math.round(cost * (1 - discount))
    const net_cost_formatted = intToCurrencyString(net_cost)
    const total = currencyStringToInt(data[subI + 5]);

    processedData.items[i] = {
      quantity,
      petcounter_sku,
      petcounter_desc,
      cost,
      discount,
      net_cost,
      net_cost_formatted,
      total
    }
  }

  return processedData
}

function getCatalogData() {
  const mainSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Catálogo_consolidado_auto")
  const catalogValues = mainSheet.getRange(2, 1).getDataRegion().getValues();

  const barcodesSkusAndNames = catalogValues.map(row => {

    return {
      ean: row[0],
      sku_petcounter: row[1],
      sku_petporium: row[2],
      description: row[3],
    }
  })

  return barcodesSkusAndNames
}

function makeBsaleDataAccountForVariations(bsaleData, catalogData) {
  ll = bsaleData.items.map((item) => item.petcounter_sku)
  const insertionData = JSON.parse(JSON.stringify(bsaleData));
  insertionData.items.forEach(item => {
    const variations = catalogData.filter(catalogItem => catalogItem.sku_petcounter === item.petcounter_sku);
    const mainVariation = variations.splice(variations.findIndex(variation => variation.ean === variation.sku_petporium), 1)[0]

    item.description = mainVariation.description;
    item.petporium_sku = mainVariation.sku_petporium;

    if (variations.length > 0) {
      item.variations = variations;
    } else {
      item.variations = null;
    }
  })

  return insertionData;
}

function processEntryForm(payloadFromFront) {
  const movementsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Movimientos")
  const currentDataInSheet = movementsSheet.getRange(1, 1).getDataRegion()
  const columns = currentDataInSheet.getLastColumn()
  const rows = currentDataInSheet.getLastRow()
  const numberOfRows = payloadFromFront.sku.length
  const entryTimeString = payloadFromFront.document.fecha + " " + payloadFromFront.document.hora
  const documentNumber = payloadFromFront.document["nro. factura"]
  const entryMatrix = []

  for (let i = 0; i < numberOfRows; i++) {
    const newRow = [
      entryTimeString,
      documentNumber,
      payloadFromFront.sku[i],
      payloadFromFront.description[i],
      payloadFromFront.quantity[i],
      payloadFromFront.net_cost[i],
    ]

    entryMatrix[i] = newRow
  }

  movementsSheet.getRange(rows+1, 1, numberOfRows, columns).setValues(entryMatrix)
}

function debugging() {
  const url = "http://app2.bsale.cl/view/10259/8521b41dfa7e";
  const rawBsaleData = getTheDataFromBsale(url)
  const catalogData = getCatalogData();
  const bsaleData = makeBsaleDataAccountForVariations(rawBsaleData, catalogData)
}
