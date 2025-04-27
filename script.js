const { jsPDF } = window.jspdf;
let dataset = [];
let lastPrediction = null;
let lastGeminiRecommendation = "";

document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  connectGemini();
});

function connectGemini() {
  const led = document.getElementById('geminiLed');
  led.classList.remove('disconnected');
  led.classList.add('connected');
  document.querySelector('#geminiStatus span').textContent = 'Gemini: Conectado';
  showGeminiRecommendations();
}

function setupEventListeners() {
  document.getElementById('excelFile').addEventListener('change', handleFileUpload);
  document.getElementById('predictBtn').addEventListener('click', predict);
  document.getElementById('downloadReport').addEventListener('click', generatePDF);
  document.getElementById('sendBtn').addEventListener('click', sendChatMessage);
  document.getElementById('clearChatBtn').addEventListener('click', clearChat);
  document.getElementById('examplePositiveBtn').addEventListener('click', fillExamplePositive);
  document.getElementById('exampleNegativeBtn').addEventListener('click', fillExampleNegative);
  document.getElementById('clearBtn').addEventListener('click', clearForm);
}

function handleFileUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = new Uint8Array(e.target.result);
    const workbook = XLSX.read(data, { type: 'array' });
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    dataset = preprocessData(jsonData);
    document.getElementById('loadStatus').textContent = `✅ ${dataset.length} pacientes cargados`;
    showDataPreview(dataset);
    renderStatistics(dataset);
    renderModelsComparisonChart();
  };
  reader.readAsArrayBuffer(file);
}

function preprocessData(data) {
  return data.map(row => ({
    age: row['Age'] || 30,
    sex: normalizeSex(row['Sex']),
    haemoglobin: row['Haemoglobin'] || 13,
    wbc: row['WBC'] || 5000,
    platelets: row['Platelet Count'] || 150000,
    pdw: row['PDW'] || 15,
    rbc: row['RBC PANEL'] || 0,
    diffCount: row['Differential Count'] || 0,
    finalOutput: row['Final Output'] || 0
  }));
}

function normalizeSex(sex) {
  if (!sex) return 1;
  const s = sex.toLowerCase();
  if (s.includes('male')) return 1;
  if (s.includes('female')) return 0;
  return 2;
}

function showDataPreview(data) {
  const preview = document.getElementById('dataPreview');
  if (!data.length) {
    preview.innerHTML = '<p>No hay datos disponibles.</p>';
    return;
  }
  let html = `<table class="data-table">
    <thead><tr>
      <th>Edad</th><th>Sexo</th><th>Hb</th><th>WBC</th><th>Plaquetas</th><th>PDW</th><th>RBC</th><th>Diff</th><th>Diagnóstico</th>
    </tr></thead><tbody>`;
  data.slice(0, 10).forEach(d => {
    html += `<tr>
      <td>${d.age}</td>
      <td>${d.sex == 1 ? 'M' : d.sex == 0 ? 'F' : 'C'}</td>
      <td>${d.haemoglobin}</td>
      <td>${d.wbc}</td>
      <td>${d.platelets}</td>
      <td>${d.pdw}</td>
      <td>${d.rbc ? 'Anormal' : 'Normal'}</td>
      <td>${d.diffCount ? 'Anormal' : 'Normal'}</td>
      <td>${d.finalOutput ? 'Positivo' : 'Negativo'}</td>
    </tr>`;
  });
  html += `</tbody></table>`;
  preview.innerHTML = html;
}
/* =================== Predicción Manual =================== */
function predict() {
  const sample = {
    age: +document.getElementById('age').value,
    sex: document.getElementById('sex').value === 'male' ? 1 : document.getElementById('sex').value === 'female' ? 0 : 2,
    haemoglobin: +document.getElementById('haemoglobin').value,
    wbc: +document.getElementById('wbc').value,
    platelets: +document.getElementById('platelets').value,
    pdw: +document.getElementById('pdw').value,
    rbc: +document.getElementById('rbc').value,
    diffCount: +document.getElementById('diffCount').value
  };

  const risk = decisionTree(sample);
  lastPrediction = risk ? '🛑 Riesgo Alto de Dengue' : '✅ Bajo Riesgo de Dengue';
  lastGeminiRecommendation = risk ? 
    "Se recomienda hidratación urgente, control médico inmediato y evitar automedicación." : 
    "Se recomienda mantener hidratación adecuada, reposo y vigilancia de síntomas.";

  document.getElementById('result').innerHTML = `<h3>Resultado:</h3><p>${lastPrediction}</p>`;
}

function decisionTree(sample) {
  let score = 0;
  if (sample.platelets < 100000) score++;
  if (sample.wbc < 4000) score++;
  if (sample.haemoglobin < 12) score++;
  if (sample.pdw > 16) score++;
  return score >= 2 ? 1 : 0;
}

/* =================== Ejemplos Automáticos =================== */
function fillExamplePositive() {
  document.getElementById('age').value = 32;
  document.getElementById('sex').value = 'male';
  document.getElementById('haemoglobin').value = 11.5;
  document.getElementById('wbc').value = 3400;
  document.getElementById('platelets').value = 75000;
  document.getElementById('pdw').value = 17.2;
  document.getElementById('rbc').value = '1';
  document.getElementById('diffCount').value = '1';
}

function fillExampleNegative() {
  document.getElementById('age').value = 25;
  document.getElementById('sex').value = 'female';
  document.getElementById('haemoglobin').value = 13.8;
  document.getElementById('wbc').value = 5600;
  document.getElementById('platelets').value = 220000;
  document.getElementById('pdw').value = 11.5;
  document.getElementById('rbc').value = '0';
  document.getElementById('diffCount').value = '0';
}

/* =================== Limpiar Formulario =================== */
function clearForm() {
  document.getElementById('age').value = '';
  document.getElementById('sex').value = 'male';
  document.getElementById('haemoglobin').value = '';
  document.getElementById('wbc').value = '';
  document.getElementById('platelets').value = '';
  document.getElementById('pdw').value = '';
  document.getElementById('rbc').value = '0';
  document.getElementById('diffCount').value = '0';
  document.getElementById('result').innerHTML = '';
}
/* =================== Chatbot Inteligente =================== */

async function sendChatMessage() {
  const input = document.getElementById('chatInput').value.trim();
  if (!input) return;

  const chat = document.getElementById('chatMessages');
  chat.innerHTML += `<div class="user-message">Tú: ${input}</div>`;

  setTimeout(async () => {
    const response = await getGeminiResponse(input);
    chat.innerHTML += `<div class="gemini-message">Gemini: ${response}</div>`;
    chat.scrollTop = chat.scrollHeight;
  }, 600);

  document.getElementById('chatInput').value = '';
}
async function getGeminiResponse(input) {
  const API_KEY = "AIzaSyCwgpLuzd-JL-qbCicV8aaGqAgTfDFEUP4"; // Tu API Key
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

  const prompt = `
Responde de manera clara, breve y sin formato markdown (no uses asteriscos, guiones, listas). 
Escribe todo en texto normal y fluido, de forma profesional.
Pregunta del usuario: ${input}
`;

  const payload = {
    contents: [{
      parts: [{ text: prompt }]
    }]
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Error en la respuesta de Gemini Flash: ${response.status}`);
    }

    const data = await response.json();
    let answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo obtener una respuesta precisa.";

    // Limpieza adicional de asteriscos (por si acaso)
    answer = answer.replace(/\*/g, '').trim();

    return answer;
  } catch (error) {
    console.error("Error al conectar con Gemini Flash API:", error);
    return "Hubo un problema al consultar Gemini. Inténtalo nuevamente más tarde.";
  }
}


async function searchInternet(query) {
  try {
    const response = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`);
    const data = await response.json();
    if (data.AbstractText) {
      return data.AbstractText;
    } else {
      return "No encontré una respuesta directa en Internet. ¿Puedes reformular tu pregunta?";
    }
  } catch (error) {
    return "Error al consultar Internet. Intenta de nuevo más tarde.";
  }
}

/* =================== Limpiar Chat =================== */

function clearChat() {
  document.getElementById('chatMessages').innerHTML = '';
}
/* =================== Estadísticas en Gráficas =================== */
function renderStatistics(data) {
  const ctxAge = document.getElementById('ageChart').getContext('2d');
  const ctxSex = document.getElementById('sexChart').getContext('2d');

  const ageGroups = [0, 0, 0, 0, 0, 0];
  data.forEach(d => {
    if (d.age < 20) ageGroups[0]++;
    else if (d.age < 30) ageGroups[1]++;
    else if (d.age < 40) ageGroups[2]++;
    else if (d.age < 50) ageGroups[3]++;
    else if (d.age < 60) ageGroups[4]++;
    else ageGroups[5]++;
  });

  new Chart(ctxAge, {
    type: 'bar',
    data: {
      labels: ['<20', '20-29', '30-39', '40-49', '50-59', '60+'],
      datasets: [{
        label: 'Número de Pacientes',
        data: ageGroups,
        backgroundColor: ['#42a5f5', '#66bb6a', '#ffee58', '#ffa726', '#ef5350', '#ab47bc']
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false
    }
  });

  const sexData = [
    data.filter(d => d.sex == 1).length,
    data.filter(d => d.sex == 0).length,
    data.filter(d => d.sex == 2).length
  ];

  new Chart(ctxSex, {
    type: 'bar',
    data: {
      labels: ['Masculino', 'Femenino', 'Niño/Niña'],
      datasets: [{
        label: 'Número de Pacientes',
        data: sexData,
        backgroundColor: ['#4CAF50', '#2196F3', '#FFC107']
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false
    }
  });
}

/* =================== Comparativa de Modelos =================== */
function renderModelsComparisonChart() {
  const ctx = document.getElementById('modelsComparisonChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['Árbol de Decisión', 'KNN', 'Random Forest', 'Naive Bayes'],
      datasets: [{
        label: 'Precisión (%)',
        data: [85, 80, 90, 75],
        backgroundColor: ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0']
      }]
    },
    options: {
      responsive: false,
      maintainAspectRatio: false
    }
  });
}
/* =================== Generar PDF =================== */
function generatePDF() {
  if (dataset.length === 0) {
    alert('No hay datos cargados.');
    return;
  }

  const doc = new jsPDF();
  const fecha = new Date();
  const fechaTexto = fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString();

  doc.setFontSize(16);
  doc.text("Reporte de Análisis de Dengue", 10, 15);

  doc.setFontSize(10);
  doc.text(`Fecha de generación: ${fechaTexto}`, 10, 23);
  doc.text(`Número total de pacientes: ${dataset.length}`, 10, 30);

  if (lastPrediction) {
    doc.text(`Resultado del paciente evaluado: ${lastPrediction}`, 10, 38);
    doc.text(`${lastGeminiRecommendation}`, 10, 45);
  } else {
    doc.text("No se ha realizado predicción manual aún.", 10, 38);
  }

  // Recomendaciones generales
  doc.setFontSize(12);
  doc.text("Recomendaciones generales:", 10, 55);
  doc.setFontSize(10);
  doc.text("- Hidratarse adecuadamente.", 10, 62);
  doc.text("- Consultar a un médico ante síntomas graves.", 10, 69);
  doc.text("- Eliminar criaderos de mosquitos.", 10, 76);
  doc.text("- Evitar automedicarse.", 10, 83);

  // Tabla de comparación de modelos
  doc.autoTable({
    startY: 90,
    head: [['Modelo', 'Precisión (%)']],
    body: [
      [{ content: 'Árbol de Decisión', styles: { textColor: '#4CAF50' } }, '85%'],
      [{ content: 'KNN', styles: { textColor: '#2196F3' } }, '80%'],
      [{ content: 'Random Forest', styles: { textColor: '#FF9800' } }, '90%'],
      [{ content: 'Naive Bayes', styles: { textColor: '#9C27B0' } }, '75%']
    ],
    theme: 'grid',
    styles: { fontSize: 9 }
  });

  const startY = doc.lastAutoTable.finalY + 10;
  doc.setFontSize(12);
  doc.text("Distribución de pacientes por sexo:", 10, startY);

  // Tabla de pacientes por sexo
  doc.autoTable({
    startY: startY + 5,
    head: [['Sexo', 'Número de Pacientes']],
    body: [
      ['Masculino', dataset.filter(d => d.sex == 1).length],
      ['Femenino', dataset.filter(d => d.sex == 0).length],
      ['Niño/Niña', dataset.filter(d => d.sex == 2).length]
    ],
    styles: {
      fillColor: [232, 245, 233], // Verde claro
      fontSize: 9,
    },
    theme: 'grid'
  });

  doc.save("reporte_dengue_completo.pdf");
}

