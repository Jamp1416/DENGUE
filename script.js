// Configuración global
const { jsPDF } = window.jspdf;
let dataset = [];
let bestModel = null;
let modelResults = [];
let geminiConnected = false; // Estado de conexión de Gemini

// Mapeo de columnas del dataset
const columnMapping = {
  age: ['Age', 'age'],
  sex: ['Sex', 'sex'],
  haemoglobin: ['Haemoglobin', 'haemoglobin'],
  wbc: ['WBC Count', 'WBC count', 'wbc'],
  platelets: ['Platelet Count', 'Platelet count', 'platelets'],
  pdw: ['PDW', 'pdw'],
  rbc: ['RBC PANEL', 'RBC Panel', 'rbc'],
  diffCount: ['Differential Count', 'differentialCount', 'diffCount'],
  finalOutput: ['Final Output', 'finalOutput', 'Diagnosis']
};

// Función para encontrar el valor correcto en los datos
function findValue(row, keys) {
  for (const key of keys) {
    if (row[key] !== undefined) {
      return row[key];
    }
  }
  return null;
}

// Preprocesamiento de datos mejorado
function preprocessData(raw) {
  return raw.map(row => {
    const age = findValue(row, columnMapping.age) || 30;
    const sex = findValue(row, columnMapping.sex) || 'male';
    const haemoglobin = findValue(row, columnMapping.haemoglobin) || 13;
    const wbc = findValue(row, columnMapping.wbc) || 5000;
    const platelets = findValue(row, columnMapping.platelets) || 150000;
    const pdw = findValue(row, columnMapping.pdw) || 15;
    const rbc = findValue(row, columnMapping.rbc) || 0;
    const diffCount = findValue(row, columnMapping.diffCount) || 0;
    const finalOutput = findValue(row, columnMapping.finalOutput) || 0;

    let sexValue;
    if (typeof sex === 'string') {
      const sexLower = sex.toLowerCase();
      if (sexLower.includes('male')) sexValue = 1;
      else if (sexLower.includes('female')) sexValue = 0;
      else sexValue = 2; // child
    } else {
      sexValue = 1; // default to male if missing
    }

    return {
      age: +age,
      sex: sexValue,
      haemoglobin: +haemoglobin,
      wbc: +wbc,
      platelets: +platelets,
      pdw: +pdw,
      rbc: +rbc,
      diffCount: +diffCount,
      finalOutput: +finalOutput === 1 ? 1 : 0,
      originalData: row // Guardamos todos los datos originales
    };
  }).filter(x =>
    !isNaN(x.age) &&
    !isNaN(x.haemoglobin) &&
    !isNaN(x.wbc) &&
    !isNaN(x.platelets) &&
    x.age > 0 && x.age < 120
  );
}

// Modelos de predicción actualizados
function decisionTree(sample) {
  const plateletsThreshold = sample.age < 18 ? 150000 : 100000;
  const wbcThreshold = 4000;
  const haemoglobinThreshold = sample.sex === 1 ? 13 : 12;

  let score = 0;

  if (sample.platelets < plateletsThreshold) score += 2;
  if (sample.wbc < wbcThreshold) score += 1;
  if (sample.haemoglobin < haemoglobinThreshold) score += 1;
  if (sample.age < 18 || sample.age > 60) score += 1;
  if (sample.pdw > 16) score += 1;
  if (sample.rbc === 1) score += 1;
  if (sample.diffCount === 1) score += 1;

  return score >= 4 ? 1 : 0;
}

function naiveBayes(sample) {
  let probHigh = 0.4;
  let probLow = 0.6;

  // Factores basados en características clínicas
  if (sample.platelets < (sample.age < 18 ? 150000 : 100000)) {
    probHigh *= 1.8;
    probLow *= 0.5;
  }
  if (sample.wbc < 4000) {
    probHigh *= 1.5;
    probLow *= 0.7;
  }
  if (sample.haemoglobin < (sample.sex === 1 ? 13 : 12)) {
    probHigh *= 1.3;
    probLow *= 0.8;
  }
  if (sample.age < 18 || sample.age > 60) {
    probHigh *= 1.2;
  }
  if (sample.pdw > 16) {
    probHigh *= 1.2;
  }
  if (sample.rbc === 1) {
    probHigh *= 1.3;
  }
  if (sample.diffCount === 1) {
    probHigh *= 1.4;
  }

  // Normalizar probabilidades
  const total = probHigh + probLow;
  probHigh /= total;
  probLow /= total;

  return probHigh > probLow ? 1 : 0;
}

function knn(sample, data, k = 5) {
  const distances = data.map(d => {
    // Ponderación de características
    const ageDist = Math.abs(d.age - sample.age) / 80;
    const sexDist = d.sex !== sample.sex ? 1 : 0;
    const hbDist = Math.abs(d.haemoglobin - sample.haemoglobin) / 5;
    const wbcDist = Math.abs(d.wbc - sample.wbc) / 15000;
    const pltDist = Math.abs(d.platelets - sample.platelets) / 200000;
    const pdwDist = Math.abs(d.pdw - sample.pdw) / 15;
    const rbcDist = d.rbc !== sample.rbc ? 1 : 0;
    const diffDist = d.diffCount !== sample.diffCount ? 1 : 0;

    // Distancia euclidiana ponderada
    const dist = Math.sqrt(
      0.1 * Math.pow(ageDist, 2) +
      0.05 * Math.pow(sexDist, 2) +
      0.15 * Math.pow(hbDist, 2) +
      0.15 * Math.pow(wbcDist, 2) +
      0.25 * Math.pow(pltDist, 2) +
      0.1 * Math.pow(pdwDist, 2) +
      0.1 * Math.pow(rbcDist, 2) +
      0.1 * Math.pow(diffDist, 2)
    );

    return {
      label: d.finalOutput,
      dist,
      original: d
    };
  }).filter(x => !isNaN(x.dist)).sort((a, b) => a.dist - b.dist);

  const topK = distances.slice(0, k);
  const votes = topK.reduce((acc, d) => acc + d.label, 0);
  return votes >= Math.ceil(k / 2) ? 1 : 0;
}

// Función de evaluación mejorada
function evaluateModel(data, predictor) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  data.forEach(d => {
    const real = d.finalOutput;
    const pred = predictor(d);

    if (real === 1 && pred === 1) tp++;
    else if (real === 0 && pred === 1) fp++;
    else if (real === 0 && pred === 0) tn++;
    else if (real === 1 && pred === 0) fn++;
  });

  const accuracy = (tp + tn) / (tp + fp + tn + fn);
  const precision = tp > 0 ? tp / (tp + fp) : 0;
  const recall = tp > 0 ? tp / (tp + fn) : 0;
  const f1 = (precision + recall) > 0 ? 2 * (precision * recall) / (precision + recall) : 0;

  return { accuracy, precision, recall, f1, tp, fp, tn, fn };
}

// Mostrar vista previa de datos
function showDataPreview(data) {
  const preview = document.getElementById('dataPreview');
  if (!data.length) {
    preview.innerHTML = '<p>No hay datos para mostrar</p>';
    return;
  }

  let html = `
    <p>Dataset cargado: ${data.length} registros</p>
    <div class="full-data-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>Edad</th>
            <th>Sexo</th>
            <th>Hemoglobina</th>
            <th>WBC</th>
            <th>Plaquetas</th>
            <th>PDW</th>
            <th>RBC</th>
            <th>Diff Count</th>
            <th>Diagnóstico</th>
          </tr>
        </thead>
        <tbody>
  `;

  data.slice(0, 50).forEach(d => { // Mostrar solo primeros 50 para no saturar
    html += `
      <tr>
        <td>${d.age}</td>
        <td>${d.sex === 1 ? 'M' : (d.sex === 0 ? 'F' : 'C')}</td>
        <td>${d.haemoglobin.toFixed(1)}</td>
        <td>${d.wbc}</td>
        <td>${d.platelets}</td>
        <td>${d.pdw.toFixed(1)}</td>
        <td>${d.rbc === 1 ? 'Anormal' : 'Normal'}</td>
        <td>${d.diffCount === 1 ? 'Anormal' : 'Normal'}</td>
        <td>${d.finalOutput === 1 ? 'Positivo' : 'Negativo'}</td>
      </tr>
    `;
  });

  html += `</tbody></table></div>`;
  if (data.length > 50) {
    html += `<p>Mostrando 50 de ${data.length} registros...</p>`;
  }

  preview.innerHTML = html;
}

// Generar reporte PDF
function generatePDFReport(results, data) {
  const doc = new jsPDF();
  const date = new Date().toLocaleString();

  // Título
  doc.setFontSize(18);
  doc.text('Reporte de Análisis de Dengue', 105, 20, { align: 'center' });
  doc.setFontSize(12);
  doc.text(`Generado el: ${date}`, 105, 30, { align: 'center' });

  // Resumen de modelos
  doc.setFontSize(14);
  doc.text('Resultados de Modelos Predictivos', 14, 40);
  doc.setFontSize(10);

  const modelData = results.map(r => [
    r.name,
    `${(r.metrics.accuracy * 100).toFixed(1)}%`,
    `${(r.metrics.precision * 100).toFixed(1)}%`,
    `${(r.metrics.recall * 100).toFixed(1)}%`,
    `${(r.metrics.f1 * 100).toFixed(1)}%`
  ]);

  doc.autoTable({
    startY: 45,
    head: [['Modelo', 'Exactitud', 'Precisión', 'Sensibilidad', 'F1-Score']],
    body: modelData,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [255, 92, 92] }
  });

  // Datos del dataset
  doc.setFontSize(14);
  doc.text('Resumen del Dataset', 14, doc.autoTable.previous.finalY + 15);
  doc.setFontSize(10);

  const statsData = [
    ['Total de registros', data.length],
    ['Casos positivos', data.filter(d => d.finalOutput === 1).length],
    ['Casos negativos', data.filter(d => d.finalOutput === 0).length],
    ['Edad promedio', (data.reduce((a, b) => a + b.age, 0) / data.length).toFixed(1)],
    ['Plaquetas promedio', Math.round(data.reduce((a, b) => a + b.platelets, 0) / data.length)],
    ['Mujeres', data.filter(d => d.sex === 0).length],
    ['Niños/Niñas', data.filter(d => d.sex === 2).length]
  ];

  doc.autoTable({
    startY: doc.autoTable.previous.finalY + 20,
    body: statsData,
    styles: { fontSize: 10 },
    columnStyles: { 1: { fontStyle: 'bold' } }
  });

  // Muestra de datos
  doc.setFontSize(14);
  doc.text('Muestra de Datos (primeros 10 registros)', 14, doc.autoTable.previous.finalY + 15);
  doc.setFontSize(8);

  const sampleData = data.slice(0, 10).map(d => [
    d.age,
    d.sex === 1 ? 'M' : (d.sex === 0 ? 'F' : 'C'),
    d.haemoglobin.toFixed(1),
    d.wbc,
    d.platelets,
    d.pdw.toFixed(1),
    d.rbc === 1 ? 'Anormal' : 'Normal',
    d.diffCount === 1 ? 'Anormal' : 'Normal',
    d.finalOutput === 1 ? 'Positivo' : 'Negativo'
  ]);

  doc.autoTable({
    startY: doc.autoTable.previous.finalY + 20,
    head: [['Edad', 'Sexo', 'Hemog', 'WBC', 'Plaq', 'PDW', 'RBC', 'Diff', 'Dx']],
    body: sampleData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [76, 175, 80] }
  });

  // Gráficas de estadísticas
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Gráficas Estadísticas', 14, 20);

  // Gráfica de distribución de edades
  const ageChartCanvas = document.getElementById('ageChart');
  const ageChartImage = ageChartCanvas.toDataURL('image/png');
  doc.addImage(ageChartImage, 'PNG', 14, 30, 180, 90);

  // Gráfica de distribución de sexo
  const sexChartCanvas = document.getElementById('sexChart');
  const sexChartImage = sexChartCanvas.toDataURL('image/png');
  doc.addImage(sexChartImage, 'PNG', 14, 130, 180, 90);

  // Comparación de modelos
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Comparación de Modelos', 14, 20);

  const comparisonData = [
    ['Modelo', 'Exactitud', 'Precisión', 'Sensibilidad', 'F1-Score']
  ];

  results.forEach(r => {
    comparisonData.push([
      r.name,
      `${(r.metrics.accuracy * 100).toFixed(1)}%`,
      `${(r.metrics.precision * 100).toFixed(1)}%`,
      `${(r.metrics.recall * 100).toFixed(1)}%`,
      `${(r.metrics.f1 * 100).toFixed(1)}%`
    ]);
  });

  doc.autoTable({
    startY: 30,
    head: comparisonData[0],
    body: comparisonData.slice(1),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [255, 92, 92] }
  });

  // Recomendaciones de Gemini
  doc.addPage();
  doc.setFontSize(14);
  doc.text('Recomendaciones de Gemini', 14, 20);
  doc.setFontSize(10);

  const recommendations = [
    'Mantente hidratado y descansa lo suficiente.',
    'Evita el uso de medicamentos antiinflamatorios no esteroideos (AINEs) como el ibuprofeno.',
    'Consulta a un médico si presentas síntomas graves como fiebre alta, dolor abdominal intenso o sangrado.',
    'Usa repelente de insectos y ropa protectora para evitar picaduras de mosquitos.',
    'Asegúrate de que tu entorno esté libre de criaderos de mosquitos.'
  ];

  const recommendationsTable = recommendations.map(rec => [rec]);

  doc.autoTable({
    startY: 30,
    head: [['Recomendación']],
    body: recommendationsTable,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [76, 175, 80] }
  });

  // Guardar PDF
  doc.save(`reporte_dengue_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// Eventos del DOM
document.addEventListener('DOMContentLoaded', () => {
  // Simular conexión con Gemini
  setTimeout(() => {
    geminiConnected = true;
    updateGeminiStatus();
    showGeminiRecommendations();
  }, 3000); // Simula una conexión después de 3 segundos

  // Cargar archivo Excel
  document.getElementById('excelFile').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheet = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheet];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });

        dataset = preprocessData(jsonData);
        document.getElementById('loadStatus').textContent = `✅ Dataset cargado: ${dataset.length} registros`;
        showDataPreview(dataset);
        renderStatistics(dataset);

        // Evaluar modelos y obtener el mejor modelo
        const splitIdx = Math.floor(dataset.length * 0.8);
        const trainData = dataset.slice(0, splitIdx);
        const testData = dataset.slice(splitIdx);

        modelResults = [
          {
            name: 'Árbol de Decisión',
            model: decisionTree,
            metrics: evaluateModel(testData, decisionTree)
          },
          {
            name: 'Naive Bayes',
            model: naiveBayes,
            metrics: evaluateModel(testData, naiveBayes)
          },
          {
            name: 'KNN (k=5)',
            model: sample => knn(sample, trainData, 5),
            metrics: evaluateModel(testData, sample => knn(sample, trainData, 5))
          }
        ];

        const bestModelResult = modelResults.reduce((a, b) =>
          (a.metrics.f1 > b.metrics.f1) ? a : b
        );
        bestModel = bestModelResult.model;

        // Habilitar botón de descarga de reporte
        document.getElementById('downloadReport').disabled = false;
      } catch (error) {
        document.getElementById('loadStatus').textContent = `❌ Error al cargar el archivo: ${error.message}`;
        console.error('Error loading Excel:', error);
      }
    };
    reader.readAsArrayBuffer(file);
  });

  // Descargar reporte PDF
  document.getElementById('downloadReport').addEventListener('click', function() {
    if (modelResults.length === 0 || !dataset || dataset.length === 0) {
      alert('Primero debes cargar un dataset');
      return;
    }
    generatePDFReport(modelResults, dataset);
  });

  // Autocompletar ejemplo positivo
  document.getElementById('examplePositiveBtn').addEventListener('click', function() {
    document.getElementById('age').value = '35';
    document.getElementById('sex').value = 'male';
    document.getElementById('haemoglobin').value = '11.2';
    document.getElementById('wbc').value = '3200';
    document.getElementById('platelets').value = '85000';
    document.getElementById('pdw').value = '17.5';
    document.getElementById('rbc').value = '1';
    document.getElementById('diffCount').value = '1';
  });

  // Autocompletar ejemplo negativo
  document.getElementById('exampleNegativeBtn').addEventListener('click', function() {
    document.getElementById('age').value = '25';
    document.getElementById('sex').value = 'female';
    document.getElementById('haemoglobin').value = '14.5';
    document.getElementById('wbc').value = '6000';
    document.getElementById('platelets').value = '250000';
    document.getElementById('pdw').value = '12.0';
    document.getElementById('rbc').value = '0';
    document.getElementById('diffCount').value = '0';
  });

  // Limpiar campos
  document.getElementById('clearBtn').addEventListener('click', function() {
    document.getElementById('age').value = '';
    document.getElementById('sex').value = 'male';
    document.getElementById('haemoglobin').value = '';
    document.getElementById('wbc').value = '';
    document.getElementById('platelets').value = '';
    document.getElementById('pdw').value = '';
    document.getElementById('rbc').value = '0';
    document.getElementById('diffCount').value = '0';
    document.getElementById('result').innerHTML = '';
  });

  // Predecir
  document.getElementById('predictBtn').addEventListener('click', function() {
    const age = +document.getElementById('age').value;
    const sex = document.getElementById('sex').value;
    const haemoglobin = +document.getElementById('haemoglobin').value;
    const wbc = +document.getElementById('wbc').value;
    const platelets = +document.getElementById('platelets').value;
    const pdw = +document.getElementById('pdw').value;
    const rbc = +document.getElementById('rbc').value;
    const diffCount = +document.getElementById('diffCount').value;

    if (!age || !haemoglobin || !wbc || !platelets || !pdw) {
      alert('Por favor complete todos los campos requeridos');
      return;
    }

    if (dataset.length === 0) {
      alert('Primero debes cargar un dataset');
      return;
    }

    const sample = {
      age,
      sex: sex === 'male' ? 1 : (sex === 'female' ? 0 : 2),
      haemoglobin,
      wbc,
      platelets,
      pdw,
      rbc,
      diffCount
    };

    const dtResult = decisionTree(sample);
    const nbResult = naiveBayes(sample);
    const knnResult = knn(sample, dataset, 5);
    const bestResult = bestModel(sample);

    let resultHTML = `
      <h3>Resultados de Predicción</h3>
      <p><strong>Árbol de Decisión:</strong> ${dtResult === 1 ? '🛑 Riesgo Alto' : '✅ Riesgo Bajo'}</p>
      <p><strong>Naive Bayes:</strong> ${nbResult === 1 ? '🛑 Riesgo Alto' : '✅ Riesgo Bajo'}</p>
      <p><strong>KNN (k=5):</strong> ${knnResult === 1 ? '🛑 Riesgo Alto' : '✅ Riesgo Bajo'}</p>
      <p><strong>Mejor Modelo:</strong> ${bestResult === 1 ? '🛑 Riesgo Alto' : '✅ Riesgo Bajo'}</p>
      <p><strong>Consenso:</strong> ${
        (dtResult + nbResult + knnResult) >= 2 ? '🛑 Mayoría sugiere Riesgo Alto' : '✅ Mayoría sugiere Riesgo Bajo'
      }</p>
    `;

    const modelResultsTable = `
      <h3>Comparación de Modelos</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>Modelo</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Árbol de Decisión</td>
            <td>${dtResult === 1 ? 'Riesgo Alto' : 'Riesgo Bajo'}</td>
          </tr>
          <tr>
            <td>Naive Bayes</td>
            <td>${nbResult === 1 ? 'Riesgo Alto' : 'Riesgo Bajo'}</td>
          </tr>
          <tr>
            <td>KNN (k=5)</td>
            <td>${knnResult === 1 ? 'Riesgo Alto' : 'Riesgo Bajo'}</td>
          </tr>
          <tr>
            <td>Mejor Modelo</td>
            <td>${bestResult === 1 ? 'Riesgo Alto' : 'Riesgo Bajo'}</td>
          </tr>
        </tbody>
      </table>
    `;

    const rangesHTML = `
      <h3>Rangos de Datos</h3>
      <ul>
        <li>Edad: 0-120 años</li>
        <li>Hemoglobina: 5-20 g/dL</li>
        <li>WBC: 1000-50000 células/μL</li>
        <li>Plaquetas: 10000-500000 células/μL</li>
        <li>PDW: 5-30</li>
        <li>RBC: Normal/Anormal</li>
        <li>Diff Count: Normal/Anormal</li>
      </ul>
    `;

    document.getElementById('result').innerHTML = resultHTML + modelResultsTable + rangesHTML;
  });

  // Chatbot Gemini
  document.getElementById('sendBtn').addEventListener('click', function() {
    const userInput = document.getElementById('chatInput').value.trim();
    if (!userInput) return;

    const chatMessages = document.getElementById('chatMessages');
    const userMessage = document.createElement('div');
    userMessage.className = 'user-message';
    userMessage.textContent = `Tú: ${userInput}`;
    chatMessages.appendChild(userMessage);

    // Simular respuesta de Gemini
    setTimeout(() => {
      const geminiResponse = document.createElement('div');
      geminiResponse.className = 'gemini-message';
      geminiResponse.textContent = `Gemini: ${getGeminiResponse(userInput)}`;
      chatMessages.appendChild(geminiResponse);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }, 1000);

    document.getElementById('chatInput').value = '';
  });
});

// Función para actualizar el estado de Gemini
function updateGeminiStatus() {
  const geminiLed = document.getElementById('geminiLed');
  const geminiStatusText = document.querySelector('#geminiStatus span');

  if (geminiConnected) {
    geminiLed.classList.remove('disconnected');
    geminiLed.classList.add('connected');
    geminiStatusText.textContent = 'Gemini: Conectado';
  } else {
    geminiLed.classList.remove('connected');
    geminiLed.classList.add('disconnected');
    geminiStatusText.textContent = 'Gemini: Desconectado';
  }
}

// Función para mostrar recomendaciones de Gemini
function showGeminiRecommendations() {
  const recommendations = [
    'Mantente hidratado y descansa lo suficiente.',
    'Evita el uso de medicamentos antiinflamatorios no esteroideos (AINEs) como el ibuprofeno.',
    'Consulta a un médico si presentas síntomas graves como fiebre alta, dolor abdominal intenso o sangrado.',
    'Usa repelente de insectos y ropa protectora para evitar picaduras de mosquitos.',
    'Asegúrate de que tu entorno esté libre de criaderos de mosquitos.'
  ];

  const recommendationsContainer = document.getElementById('geminiRecommendations');
  let html = '<h3>Recomendaciones de Gemini:</h3><ul>';
  recommendations.forEach(rec => {
    html += `<li>${rec}</li>`;
  });
  html += '</ul>';
  recommendationsContainer.innerHTML = html;
}

// Función para renderizar gráficas estadísticas
function renderStatistics(data) {
  const ctxAge = document.getElementById('ageChart').getContext('2d');
  const ctxSex = document.getElementById('sexChart').getContext('2d');

  // Gráfica de distribución de edades
  const ageLabels = ['0-10', '11-20', '21-30', '31-40', '41-50', '51-60', '61-70', '71-80', '81-90', '91-100'];
  const ageData = ageLabels.map(label => {
    const [min, max] = label.split('-').map(Number);
    return data.filter(d => d.age >= min && d.age <= max).length;
  });

  new Chart(ctxAge, {
    type: 'bar',
    data: {
      labels: ageLabels,
      datasets: [{
        label: 'Distribución de Edades',
        data: ageData,
        backgroundColor: '#4CAF50'
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: 'Número de personas'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Rango de edades'
          }
        }
      },
      plugins: {
        legend: {
          position: 'top'
        }
      }
    }
  });

  // Gráfica de distribución de sexo
  const sexData = {
    'Masculino': data.filter(d => d.sex === 1).length,
    'Femenino': data.filter(d => d.sex === 0).length,
    'Niño/Niña': data.filter(d => d.sex === 2).length
  };

  new Chart(ctxSex, {
    type: 'pie',
    data: {
      labels: Object.keys(sexData),
      datasets: [{
        label: 'Distribución de Sexo',
        data: Object.values(sexData),
        backgroundColor: ['#4CAF50', '#2196F3', '#FF9800']
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          position: 'top'
        }
      }
    }
  });
}

// Función para obtener respuestas simuladas de Gemini
function getGeminiResponse(userInput) {
  const responses = {
    'hola': 'Hola! ¿En qué puedo ayudarte hoy?',
    'riesgo': 'El riesgo de dengue puede variar según varios factores. ¿Tienes algún síntoma específico?',
    'síntomas': 'Los síntomas comunes del dengue incluyen fiebre alta, dolor de cabeza, dolor detrás de los ojos, dolor en las articulaciones y erupciones cutáneas.',
    'tratamiento': 'El tratamiento del dengue generalmente incluye descanso, hidratación y medicamentos para reducir la fiebre y el dolor.',
    'prevención': 'Para prevenir el dengue, usa repelente de insectos, usa ropa protectora y elimina los criaderos de mosquitos en tu entorno.',
    'tipos': 'Existen cuatro serotipos del virus del dengue: DENV-1, DENV-2, DENV-3 y DENV-4. Cada uno puede causar la enfermedad, y la infección con uno de ellos no proporciona inmunidad contra los otros.',
    'default': 'Lo siento, no tengo información sobre eso. ¿Hay algo más en lo que pueda ayudarte?'
  };

  const lowerInput = userInput.toLowerCase();
  if (lowerInput.includes('dengue')) {
    if (lowerInput.includes('síntomas')) {
      return 'Los síntomas comunes del dengue incluyen fiebre alta, dolor de cabeza, dolor detrás de los ojos, dolor en las articulaciones y erupciones cutáneas.';
    } else if (lowerInput.includes('tratamiento')) {
      return 'El tratamiento del dengue generalmente incluye descanso, hidratación y medicamentos para reducir la fiebre y el dolor.';
    } else if (lowerInput.includes('prevención')) {
      return 'Para prevenir el dengue, usa repelente de insectos, usa ropa protectora y elimina los criaderos de mosquitos en tu entorno.';
    } else if (lowerInput.includes('riesgo')) {
      return 'El riesgo de dengue puede variar según varios factores. ¿Tienes algún síntoma específico?';
    } else if (lowerInput.includes('tipos')) {
      return 'Existen cuatro serotipos del virus del dengue: DENV-1, DENV-2, DENV-3 y DENV-4. Cada uno puede causar la enfermedad, y la infección con uno de ellos no proporciona inmunidad contra los otros.';
    } else {
      return 'El dengue es una enfermedad viral transmitida por mosquitos. ¿Tienes alguna pregunta específica sobre el dengue?';
    }
  }

  for (const key in responses) {
    if (lowerInput.includes(key)) {
      return responses[key];
    }
  }
  return responses['default'];
}
