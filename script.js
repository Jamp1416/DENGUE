const API_KEY = "AIzaSyCwgpLuzd-JL-qbCicV8aaGqAgTfDFEUP4"; // ⚠️ Tu clave va aquí
const { jsPDF } = window.jspdf;

window.onload = async function () {
    // Valores por defecto
    document.getElementById('age').value = 43;
    document.getElementById('sex').value = "male";
    document.getElementById('haemoglobin').value = 12.6;
    document.getElementById('wbc').value = 2200;
    document.getElementById('platelets').value = 62000;

    document.getElementById('predictBtn').addEventListener('click', predictLocalAndAskGemini);
    document.getElementById('downloadPDF').addEventListener('click', generatePDF);

    // Verificar conexión con Gemini
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: "¿Estás activo?" }] }]
            })
        });

        const result = await response.json();
        const working = result?.candidates?.[0]?.content?.parts?.[0]?.text;
        document.getElementById('status').textContent = working ? "✅ Conectado a Gemini" : "❌ Conexión fallida";
    } catch (e) {
        console.error("Error conectando a Gemini:", e);
        document.getElementById('status').textContent = "❌ Error al conectar con Gemini";
    }
};

async function predictLocalAndAskGemini() {
    const age = parseInt(document.getElementById('age').value);
    const sex = document.getElementById('sex').value;
    const sexText = sex === 'male' ? 'Masculino' : 'Femenino';
    const haemoglobin = parseFloat(document.getElementById('haemoglobin').value);
    const wbc = parseInt(document.getElementById('wbc').value);
    const platelets = parseInt(document.getElementById('platelets').value);
    
    // Verificar que todos los campos estén llenos
    if (!age || !haemoglobin || !wbc || !platelets) {
        alert("Por favor complete todos los campos");
        return;
    }

    // Calcular predicción
    let score = 0;
    if (age > 50) score += 1;
    if (wbc < 3000) score += 2;
    if (platelets < 100000) score += 2;
    if (haemoglobin < 12) score += 1;

    const prediction = score >= 4 ? "🛑 Alto Riesgo de Dengue" : "✅ Riesgo Bajo";
    const riskLevel = score >= 4 ? "alto" : "bajo";
    const date = new Date().toLocaleString();

    // Mostrar predicción automática
    const predictionResult = document.getElementById('predictionResult');
    predictionResult.innerHTML = `
        <h3>🔮 Resultado del Análisis</h3>
        <div class="result-data">
            <p><strong>Fecha:</strong> ${date}</p>
            <p><strong>Paciente:</strong> ${age} años, ${sexText}</p>
            <p><strong>Hemoglobina:</strong> ${haemoglobin} g/dL</p>
            <p><strong>Glóbulos Blancos:</strong> ${wbc}/mm³</p>
            <p><strong>Plaquetas:</strong> ${platelets}/mm³</p>
            <p class="prediction-result ${riskLevel}"><strong>Predicción:</strong> ${prediction}</p>
            <p><strong>Puntaje de Riesgo:</strong> ${score}/6</p>
        </div>
    `;

    // Agregar al historial
    const history = document.getElementById('history');
    const entry = document.createElement('div');
    entry.className = 'history-entry';
    entry.innerHTML = `
        <p><strong>${date}</strong></p>
        <p>Edad: ${age}, Sexo: ${sexText}</p>
        <p class="${riskLevel}">Resultado: ${prediction}</p>
    `;
    history.prepend(entry);

    // Mostrar estado de espera
    const adviceBox = document.getElementById('adviceText');
    adviceBox.innerHTML = `<p class="loading">💬 Solicitando recomendaciones médicas a Gemini...</p>`;

    // Prompt para Gemini mejorado para obtener respuestas estructuradas
    const prompt = `
Actúa como un médico especializado en enfermedades tropicales. El sistema automático ha predicho lo siguiente para un paciente:

- Edad: ${age}
- Sexo: ${sexText}
- Hemoglobina: ${haemoglobin} g/dL
- Glóbulos blancos: ${wbc}/mm³
- Plaquetas: ${platelets}/mm³
- Predicción: ${prediction} (Puntaje: ${score}/6)

Por favor, proporciona una respuesta estructurada con estos puntos específicos:
1. INTERPRETACIÓN: Una breve interpretación médica de los valores (máximo 3 oraciones)
2. RECOMENDACIONES: Exactamente 2 sugerencias prácticas para el paciente
3. VIGILANCIA: Un punto sobre qué síntomas vigilar

Asegúrate de ser conciso y directo. No uses más de 2-3 oraciones por cada sección.
`;

    try {
        // Timeout en caso de tardanza
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10 segundos

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`, {
            method: "POST",
            signal: controller.signal,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        clearTimeout(timeout);
        const result = await response.json();
        let reply = result.candidates?.[0]?.content?.parts?.[0]?.text || "(Sin respuesta válida)";
        
        // Procesar la respuesta para formatearla mejor
        reply = formatGeminiResponse(reply);
        
        adviceBox.innerHTML = reply;
        
        // Mostrar botón de descarga
        document.getElementById('downloadPDF').style.display = 'block';

    } catch (error) {
        console.error("Gemini error:", error);
        adviceBox.innerHTML = `<p class="error">❌ No se pudo obtener respuesta de Gemini. Intenta de nuevo más tarde.</p>`;
    }
}

function formatGeminiResponse(text) {
    // Buscar secciones en la respuesta
    const interpretacionMatch = text.match(/INTERPRETACIÓN:?(.*?)(?=RECOMENDACIONES:|VIGILANCIA:|$)/s);
    const recomendacionesMatch = text.match(/RECOMENDACIONES:?(.*?)(?=VIGILANCIA:|$)/s);
    const vigilanciaMatch = text.match(/VIGILANCIA:?(.*?)$/s);
    
    // Construir HTML estructurado
    let formattedHTML = '<div class="gemini-response">';
    
    if (interpretacionMatch && interpretacionMatch[1]) {
        formattedHTML += `<div class="response-section">
            <h4>📋 Interpretación Médica:</h4>
            <p>${interpretacionMatch[1].trim()}</p>
        </div>`;
    }
    
    if (recomendacionesMatch && recomendacionesMatch[1]) {
        const recomendaciones = recomendacionesMatch[1].trim()
            .split(/\d+\./).filter(item => item.trim() !== '')
            .map(item => `<li>${item.trim()}</li>`).join('');
            
        formattedHTML += `<div class="response-section">
            <h4>💊 Recomendaciones:</h4>
            <ul>${recomendaciones || '<li>' + recomendacionesMatch[1].trim() + '</li>'}</ul>
        </div>`;
    }
    
    if (vigilanciaMatch && vigilanciaMatch[1]) {
        formattedHTML += `<div class="response-section">
            <h4>🔍 Vigilancia:</h4>
            <p>${vigilanciaMatch[1].trim()}</p>
        </div>`;
    }
    
    // Si no se encontró ninguna sección estructurada, devolver el texto original
    if (!interpretacionMatch && !recomendacionesMatch && !vigilanciaMatch) {
        formattedHTML += `<p>${text}</p>`;
    }
    
    formattedHTML += '</div>';
    return formattedHTML;
}

async function generatePDF() {
    // Crear una instancia de jsPDF
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });
    
    try {
        // Obtener el contenido principal para el PDF
        const resultSection = document.getElementById('resultSection');
        
        // Usar html2canvas para convertir el contenido a imagen
        const canvas = await html2canvas(resultSection, {
            scale: 2, // Mayor calidad
            useCORS: true,
            logging: false
        });
        
        // Obtener la imagen como data URL
        const imgData = canvas.toDataURL('image/png');
        
        // Tamaño de la página
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        // Configurar título
        pdf.setFontSize(16);
        pdf.setTextColor(255, 92, 92);
        pdf.text('Sistema Predictivo de Dengue', pageWidth/2, 20, {align: 'center'});
        
        // Añadir fecha
        pdf.setFontSize(10);
        pdf.setTextColor(100, 100, 100);
        pdf.text(`Generado el: ${new Date().toLocaleString()}`, pageWidth/2, 27, {align: 'center'});
        
        // Calcular ratio para mantener proporciones
        const imgWidth = pageWidth - 40; // margen de 20mm a cada lado
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        // Añadir la imagen al PDF
        pdf.addImage(imgData, 'PNG', 20, 35, imgWidth, imgHeight);
        
        // Añadir pie de página
        pdf.setFontSize(8);
        pdf.setTextColor(150, 150, 150);
        pdf.text('Este documento es informativo y no sustituye el consejo médico profesional.', pageWidth/2, pageHeight - 10, {align: 'center'});
        
        // Guardar el PDF
        pdf.save('prediccion-dengue.pdf');
        
    } catch (error) {
        console.error('Error al generar PDF:', error);
        alert('Ocurrió un error al generar el PDF. Por favor intente nuevamente.');
    }
}