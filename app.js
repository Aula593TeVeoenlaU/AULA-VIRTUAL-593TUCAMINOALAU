import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, deleteDoc, collection, getDocs, addDoc, query, where, orderBy } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// ==========================================
// 🔴 CONFIGURACIÓN
// ==========================================
const ADMIN_EMAIL = "videosc847@gmail.com"; 
const CORREO_FORMSUBMIT = "sebastianneto84@gmail.com";

const firebaseConfig = {
  apiKey: "AIzaSyAO_RcOstMWsdsHyawSaSsNrxnI5KNDaGU",
  authDomain: "simulador-quiz20-5.firebaseapp.com",
  projectId: "simulador-quiz20-5",
  storageBucket: "simulador-quiz20-5.firebasestorage.app",
  messagingSenderId: "677582682271",
  appId: "1:677582682271:web:b1f3f2ab0b60e7f9be0aaa"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

let usuarioActual = null;
let materiaActual = null;
let temaActualInfo = null; 
let quizActivo = null; 

// ==========================================
// CONTROL DE INTERFAZ
// ==========================================
function mostrarSeccion(id) {
    document.querySelectorAll('.content-area > div').forEach(div => div.classList.add('hidden'));
    const seccion = document.getElementById(id);
    if(seccion) seccion.classList.remove('hidden');
    window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', function() {
    
    // Navegación
    document.querySelectorAll('.btn-volver-dash').forEach(btn => {
        btn.addEventListener("click", () => mostrarSeccion("dashboard-section"));
    });
    
    document.querySelectorAll('.btn-volver-temas').forEach(btn => {
        btn.addEventListener("click", () => mostrarSeccion("lista-temas-section"));
    });

    const btnIrAdmin = document.getElementById("btn-ir-admin");
    if(btnIrAdmin) btnIrAdmin.addEventListener("click", () => {
        mostrarSeccion("admin-section");
        cargarAdminGestion();
        cargarAdminAlumnos();
    });
    
    const btnVerDash = document.getElementById("btn-ver-dash-como-alumno");
    if(btnVerDash) btnVerDash.addEventListener("click", () => mostrarSeccion("dashboard-section"));
    
    document.querySelectorAll('.btn-logout').forEach(btn => {
        btn.addEventListener("click", () => signOut(auth));
    });

    const btnLogin = document.getElementById("btn-login");
    if(btnLogin){
        btnLogin.addEventListener("click", () => {
            document.getElementById("login-error").classList.add("hidden");
            signInWithPopup(auth, provider).catch(err => {
                document.getElementById("login-error").textContent = "Error de conexión. Intenta de nuevo.";
                document.getElementById("login-error").classList.remove("hidden");
            });
        });
    }

    // ==========================================
    // ADMIN: AÑADIR ALUMNOS A LISTA BLANCA
    // ==========================================
    const btnAddAlumno = document.getElementById("btn-agregar-alumno");
    if(btnAddAlumno){
        btnAddAlumno.addEventListener("click", async () => {
            const email = document.getElementById("input-nuevo-alumno").value.trim().toLowerCase();
            if(!email) return alert("Escribe un correo válido");
            
            try {
                await setDoc(doc(db, "alumnos_autorizados", email), {
                    email: email,
                    fecha_agregado: new Date().toISOString()
                });
                document.getElementById("input-nuevo-alumno").value = "";
                alert("Alumno autorizado correctamente.");
                cargarAdminAlumnos();
            } catch(e) {
                alert("Error: " + e.message);
            }
        });
    }

    // ==========================================
    // ADMIN: CREAR TEMA (Híbrido IA + Estático)
    // ==========================================
    const btnGenerarTema = document.getElementById("btn-generar-tema-admin");
    if(btnGenerarTema){
        btnGenerarTema.addEventListener("click", async () => {
            const materia = document.getElementById("input-materia").value;
            const tituloTema = document.getElementById("input-nuevo-tema").value.trim();
            const videosRaw = document.getElementById("input-videos").value;
            const lecturasRaw = document.getElementById("input-lecturas").value;
            
            if (!tituloTema) return alert("El título es obligatorio.");
            
            const status = document.getElementById("admin-status");
            btnGenerarTema.disabled = true;
            status.style.color = "var(--primary-light)";
            status.innerHTML = "<i class='fas fa-spinner fa-spin'></i> Generando resumen con IA y guardando links...";

            try {
                // 1. Extraer Links (Función inteligente de parseo)
                const extraerLinks = (texto) => {
                    return texto.split('\n').filter(line => line.includes('http')).map(line => {
                        const parts = line.split('http');
                        let title = parts[0].replace(/^[\d\.\-\*]*\s*/, '').replace(/:\s*$/, '').trim();
                        if(!title) title = "Enlace sugerido";
                        return { titulo: title, url: 'http' + parts[1].trim() };
                    });
                };

                const videosEstructurados = extraerLinks(videosRaw);
                const lecturasEstructuradas = extraerLinks(lecturasRaw);

                // 2. Pedir resumen de 150 palabras a Gemini
                const promptText = `Actúa como profesor de ${materia}. Escribe un resumen introductorio de máximo 150 palabras para el tema: "${tituloTema}". 
                Devuelve EXCLUSIVAMENTE un JSON con esta estructura exacta (sin formato markdown):
                {
                  "resumen_teorico": "Tu texto aquí..."
                }`;

                const response = await fetch('/.netlify/functions/gemini', {
                    method: "POST", 
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: promptText,
                        modelo: "gemini-3.6-flash" // Modelo rápido actualizado
                    })
                });

                const data = await response.json();
                
                if (!data.candidates || data.candidates.length === 0) {
                    throw new Error("La IA no devolvió contenido.");
                }

                let rawText = data.candidates[0].content.parts[0].text;
                const contenidoIA = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());

                // 3. Guardar en Firestore
                await addDoc(collection(db, "temas_globales"), {
                    materia: materia,
                    titulo: tituloTema,
                    resumen_teorico: contenidoIA.resumen_teorico,
                    videos_recomendados: videosEstructurados,
                    lecturas_recomendadas: lecturasEstructuradas,
                    fecha_creacion: new Date().toISOString(),
                    creador: usuarioActual.email
                });

                status.style.color = "var(--success)";
                status.innerHTML = "<i class='fas fa-check'></i> Tema creado y guardado con éxito.";
                document.getElementById("input-nuevo-tema").value = "";
                document.getElementById("input-videos").value = "";
                document.getElementById("input-lecturas").value = "";
                cargarAdminGestion();
            } catch (error) {
                console.error(error);
                status.style.color = "var(--danger)";
                status.innerHTML = `<i class='fas fa-times'></i> Error: ${error.message}`;
            } finally {
                btnGenerarTema.disabled = false;
                setTimeout(() => status.innerHTML = "", 5000);
            }
        });
    }

    // ==========================================
    // ALUMNO: GENERAR SIMULADOR
    // ==========================================
    const btnGenerarSimulador = document.getElementById("btn-generar-simulador");
    if(btnGenerarSimulador){
        btnGenerarSimulador.addEventListener("click", async () => {
            const status = document.getElementById("simulador-status");
            
            // Límite ahora es 5 al día
            const hoy = new Date().toISOString().split('T')[0];
            const limiteRef = doc(db, "usuarios", usuarioActual.uid, "limites", `${hoy}_${temaActualInfo.id}`);
            const limiteSnap = await getDoc(limiteRef);
            let generadosHoy = limiteSnap.exists() ? limiteSnap.data().cantidad : 0;

            if (generadosHoy >= 5) {
                status.style.color = "var(--danger)";
                status.textContent = "❌ Has alcanzado el límite de 5 simuladores diarios para este tema.";
                return;
            }

            btnGenerarSimulador.disabled = true;
            status.style.color = "var(--primary-light)";
            status.innerHTML = "<i class='fas fa-circle-notch fa-spin'></i> Construyendo examen con IA...";

            try {
                const promptText = `Actúa como creador de exámenes para admisión universitaria. Materia: ${materiaActual}. Tema: "${temaActualInfo.titulo}".
                Genera un cuestionario de 5 preguntas de opción múltiple estrictamente sobre este tema.
                Devuelve EXCLUSIVAMENTE un JSON con esta estructura (sin formato markdown):
                {
                  "preguntas": [
                    {
                      "enunciado": "Pregunta...",
                      "opciones": ["A) op1", "B) op2", "C) op3", "D) op4"],
                      "respuesta_correcta": 0,
                      "explicacion": "Breve justificación de por qué es la correcta."
                    }
                  ]
                }`;

                const response = await fetch('/.netlify/functions/gemini', {
                    method: "POST", 
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: promptText,
                        modelo: "gemini-3.1-flash-lite" 
                    })
                });

                const data = await response.json();
                
                if (!data.candidates || data.candidates.length === 0) {
                    throw new Error("La IA falló al crear las preguntas.");
                }

                let rawText = data.candidates[0].content.parts[0].text;
                const simuladorJSON = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());

                await addDoc(collection(db, "usuarios", usuarioActual.uid, "simuladores_guardados"), {
                    tema_id: temaActualInfo.id,
                    tema_titulo: temaActualInfo.titulo,
                    preguntas: simuladorJSON.preguntas,
                    fecha_creacion: new Date().toISOString()
                });

                await setDoc(limiteRef, { cantidad: generadosHoy + 1 });

                status.style.color = "var(--success)";
                status.textContent = "✅ Simulador listo.";
                cargarMisSimuladores();
            } catch (e) {
                console.error(e);
                status.style.color = "var(--danger)";
                status.textContent = `❌ Error: ${e.message}`;
            } finally {
                btnGenerarSimulador.disabled = false;
                setTimeout(() => status.textContent = "", 6000);
            }
        });
    }

    // ==========================================
    // ALUMNO: ENVIAR QUIZ Y CALIFICAR
    // ==========================================
    const btnEnviarQuiz = document.getElementById("btn-enviar-quiz");
    if(btnEnviarQuiz){
        btnEnviarQuiz.addEventListener("click", async () => {
            let puntaje = 0;
            
            quizActivo.forEach((p, index) => {
                const seleccion = document.querySelector(`input[name="q${index}"]:checked`);
                const divPreg = document.getElementById(`div-q${index}`);
                const divExp = document.getElementById(`exp-q${index}`);
                
                divExp.classList.remove("hidden");

                if (seleccion && parseInt(seleccion.value) === p.respuesta_correcta) {
                    puntaje++;
                    divPreg.style.borderLeft = "6px solid var(--success)";
                    divPreg.style.borderColor = "var(--success)";
                } else {
                    divPreg.style.borderLeft = "6px solid var(--danger)";
                    divPreg.style.borderColor = "var(--danger)";
                }
            });

            const divResult = document.getElementById("resultado-quiz");
            divResult.innerHTML = `Puntaje Obtenido:<br><span style="font-size: 48px; font-weight: 800; color: ${puntaje === quizActivo.length ? 'var(--success)' : 'var(--primary)'};">${puntaje} / ${quizActivo.length}</span>`;
            divResult.style.display = "block";
            
            btnEnviarQuiz.classList.add("hidden"); 
            document.getElementById("btn-volver-estudio-desde-quiz").classList.remove("hidden");
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });

            await addDoc(collection(db, "usuarios", usuarioActual.uid, "historial_pruebas"), {
                materia: materiaActual,
                tema: temaActualInfo.titulo,
                fecha: new Date().toLocaleString(),
                puntaje: puntaje,
                total: quizActivo.length,
                timestamp: new Date().getTime()
            });
            cargarHistorialGlobal(); 

            // Formsubmit silencioso
            fetch(`https://formsubmit.co/ajax/${CORREO_FORMSUBMIT}`, {
                method: "POST", headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _subject: `Simulador Completado - ${usuarioActual.email}`, usuario: usuarioActual.email, materia: materiaActual, tema: temaActualInfo.titulo, resultado: `${puntaje}/${quizActivo.length}` })
            }).catch(e => console.log("Opcional formsubmit falló"));
        });
    }

    const btnVolverQuiz = document.getElementById("btn-volver-estudio-desde-quiz");
    if(btnVolverQuiz){
        btnVolverQuiz.addEventListener("click", () => mostrarSeccion("estudio-section"));
    }
}); 

// ==========================================
// AUTENTICACIÓN Y VERIFICACIÓN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        
        // 1. Verificar Lista Blanca (Si NO es admin)
        if (user.email !== ADMIN_EMAIL) {
            const authSnap = await getDoc(doc(db, "alumnos_autorizados", user.email.toLowerCase()));
            if (!authSnap.exists()) {
                const errBox = document.getElementById("login-error");
                if(errBox) {
                    errBox.innerHTML = `Tu correo (<b>${user.email}</b>) no está autorizado.<br>Contacta a tu profesor para que te brinde acceso.`;
                    errBox.classList.remove("hidden");
                }
                await signOut(auth);
                return; // Detiene la ejecución
            }
        }

        // 2. Si pasa, continuar login
        usuarioActual = user;
        const nombreUsr = document.getElementById("nombre-usuario");
        if(nombreUsr) nombreUsr.textContent = user.displayName;
        
        await setDoc(doc(db, "usuarios_registrados", user.uid), {
            nombre: user.displayName, email: user.email, ultimo_acceso: new Date().toISOString()
        }, { merge: true });

        const btnAdmin = document.getElementById("btn-ir-admin");
        if (user.email === ADMIN_EMAIL) {
            if(btnAdmin) btnAdmin.classList.remove("hidden");
            mostrarSeccion("admin-section");
            cargarAdminGestion();
            cargarAdminAlumnos();
        } else {
            if(btnAdmin) btnAdmin.classList.add("hidden");
            cargarHistorialGlobal();
            mostrarSeccion("dashboard-section");
        }
    } else {
        usuarioActual = null;
        mostrarSeccion("login-section");
    }
});

// ==========================================
// FUNCIONES GLOBALES (ALUMNO)
// ==========================================

// Click en la tarjeta de materia
window.abrirMateria = async function(materia) {
    materiaActual = materia;
    document.getElementById("titulo-materia-seleccionada").textContent = "Módulos de " + materia;
    mostrarSeccion("lista-temas-section");

    const contenedor = document.getElementById("student-temas-list");
    contenedor.innerHTML = "<p>Cargando módulos...</p>";

    const q = query(collection(db, "temas_globales"), where("materia", "==", materia));
    const snap = await getDocs(q);
    
    let html = "";
    if (snap.empty) {
        html = "<p style='grid-column: 1/-1;'>Pronto añadiremos módulos para esta materia.</p>";
    } else {
        snap.forEach(doc => {
            const data = doc.data();
            html += `
                <div class="topic-card" onclick="abrirTemaEstudio('${doc.id}', '${data.titulo.replace(/'/g, "\\'")}')">
                    <div style="font-size: 24px; color: var(--primary-light); margin-bottom: 10px;"><i class="fas fa-layer-group"></i></div>
                    <h3>${data.titulo}</h3>
                    <p style="color: var(--text-light); font-size: 14px; margin: 0 0 15px 0;">Contiene resumen IA, recursos y simuladores.</p>
                    <button class="btn-outline" style="width:100%; border-color: var(--border);">📖 Entrar al Módulo</button>
                </div>`;
        });
    }
    contenedor.innerHTML = html;
}

window.abrirTemaEstudio = async function(idGlobal, titulo) {
    temaActualInfo = { id: idGlobal, titulo: titulo };
    document.getElementById("titulo-tema-estudio").textContent = titulo;
    mostrarSeccion("estudio-section");

    const docSnap = await getDoc(doc(db, "temas_globales", idGlobal));
    if (docSnap.exists()) {
        const data = docSnap.data();
        
        // Render Resumen
        const contResumen = document.getElementById("contenido-resumen");
        if(typeof marked !== 'undefined') {
            contResumen.innerHTML = marked.parse(data.resumen_teorico || "Sin resumen.");
        } else {
            contResumen.innerHTML = data.resumen_teorico || "Sin resumen.";
        }
        
        // Render Videos Estáticos
        const listaVid = document.getElementById("lista-videos");
        if (data.videos_recomendados && data.videos_recomendados.length > 0) {
            listaVid.innerHTML = data.videos_recomendados.map(v => 
                `<li><i class="fab fa-youtube" style="color:var(--danger)"></i> <a href="${v.url}" target="_blank">${v.titulo}</a></li>`).join('');
        } else {
            listaVid.innerHTML = "<p style='font-size:14px; color:var(--text-light); padding:0 15px;'>No hay videos definidos.</p>";
        }
            
        // Render Lecturas Estáticas
        const listaLec = document.getElementById("lista-lecturas");
        if (data.lecturas_recomendadas && data.lecturas_recomendadas.length > 0) {
            listaLec.innerHTML = data.lecturas_recomendadas.map(l => 
                `<li><i class="fas fa-file-alt" style="color:var(--primary-light)"></i> <a href="${l.url}" target="_blank">${l.titulo}</a></li>`).join('');
        } else {
             listaLec.innerHTML = "<p style='font-size:14px; color:var(--text-light); padding:0 15px;'>No hay lecturas definidas.</p>";
        }
    }

    cargarMisSimuladores();
}

async function cargarMisSimuladores() {
    const contenedor = document.getElementById("lista-mis-simuladores");
    contenedor.innerHTML = "<p>Buscando historial...</p>";
    
    const q = query(
        collection(db, "usuarios", usuarioActual.uid, "simuladores_guardados"),
        where("tema_id", "==", temaActualInfo.id)
    );
    
    const snap = await getDocs(q);
    if (snap.empty) {
        contenedor.innerHTML = "<p style='grid-column: 1/-1; color: var(--text-light);'>Aún no has generado simuladores. ¡Crea el primero!</p>";
        return;
    }

    let html = "";
    let cont = 1;
    snap.forEach(doc => {
        const data = doc.data();
        const safePreguntas = JSON.stringify(data.preguntas).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        html += `<button class="btn-outline" style="padding: 15px; font-size: 14px; justify-content: flex-start; text-align:left;" onclick="iniciarQuiz(${safePreguntas})">
                    <i class="fas fa-file-signature"></i> Examen Práctico #${cont}
                 </button>`;
        cont++;
    });
    contenedor.innerHTML = html;
}

window.iniciarQuiz = function(preguntas) {
    quizActivo = preguntas;
    
    document.getElementById("quiz-tema-titulo").textContent = materiaActual + " - " + temaActualInfo.titulo;
    document.getElementById("btn-enviar-quiz").classList.remove("hidden"); 
    document.getElementById("btn-volver-estudio-desde-quiz").classList.add("hidden");
    document.getElementById("resultado-quiz").style.display = "none";
    
    const contenedor = document.getElementById("contenedor-preguntas");
    contenedor.innerHTML = "";

    quizActivo.forEach((p, index) => {
        let opcionesHtml = p.opciones.map((opc, i) => `
            <div class="opcion">
                <label><input type="radio" name="q${index}" value="${i}"> <span>${opc}</span></label>
            </div>
        `).join('');

        contenedor.innerHTML += `
            <div class="pregunta" id="div-q${index}">
                <p style="font-size: 1.1em; font-weight: 600; color: var(--primary); margin-top:0;">
                    <span style="color: var(--secondary); margin-right: 5px;">${index + 1}.</span> ${p.enunciado}
                </p>
                ${opcionesHtml}
                <div class="hidden explicacion" id="exp-q${index}" style="background: #F0FDF4; padding: 15px 20px; border-radius: 10px; margin-top: 15px; border-left: 4px solid var(--success);">
                    <p style="margin:0; color: #166534;"><i class="fas fa-lightbulb" style="color:var(--secondary)"></i> <strong>Justificación:</strong> ${p.explicacion}</p>
                </div>
            </div>
        `;
    });
    
    if (window.MathJax) {
        MathJax.typesetPromise();
    }
    
    mostrarSeccion("quiz-section");
}

async function cargarHistorialGlobal() {
    const contenedor = document.getElementById("lista-historial-global");
    if (!usuarioActual || !contenedor) return;
    
    // Obtenemos los últimos 15 intentos ordenados por fecha
    const q = query(collection(db, "usuarios", usuarioActual.uid, "historial_pruebas"), orderBy("timestamp", "desc"));
    const snap = await getDocs(q);
    
    if (snap.empty) {
        contenedor.innerHTML = "<li style='justify-content:center; color: var(--text-light);'>Aún no tienes historial de prácticas.</li>";
        return;
    }

    let html = "";
    snap.forEach(doc => {
        const h = doc.data();
        const calificacion = (h.puntaje / h.total) * 100;
        const color = calificacion >= 70 ? 'var(--success)' : (calificacion >= 40 ? 'var(--secondary)' : 'var(--danger)');
        
        html += `
        <li>
            <div style="margin-right: 15px; font-size: 20px; color: var(--text-light);"><i class="fas fa-clipboard-check"></i></div>
            <div style="flex:1">
                <strong style="display:block; margin-bottom: 2px;">${h.tema}</strong>
                <span style="font-size: 13px; color: var(--text-light);">${h.materia} • ${h.fecha.split(',')[0]}</span>
            </div>
            <div style="background: ${color}; color: white; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 14px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                ${h.puntaje} / ${h.total}
            </div>
        </li>`;
    });
    contenedor.innerHTML = html;
}

// ==========================================
// FUNCIONES GLOBALES (ADMIN)
// ==========================================
async function cargarAdminAlumnos() {
    const contenedor = document.getElementById("lista-alumnos-admin");
    if(!contenedor) return;
    
    const snap = await getDocs(collection(db, "alumnos_autorizados"));
    if(snap.empty) {
        contenedor.innerHTML = "<p>No hay alumnos autorizados aún.</p>";
        return;
    }
    
    let html = "";
    snap.forEach(doc => {
        html += `
        <div class="admin-list-item">
            <div><i class="fas fa-user-check" style="color:var(--success); margin-right: 10px;"></i> <strong>${doc.data().email}</strong></div>
            <button class="btn-danger" style="padding: 6px 12px; font-size: 12px;" onclick="eliminarAlumno('${doc.id}')"><i class="fas fa-trash"></i></button>
        </div>`;
    });
    contenedor.innerHTML = html;
}

window.eliminarAlumno = async function(emailId) {
    if(confirm(`¿Estás seguro de quitar el acceso a ${emailId}?`)){
        await deleteDoc(doc(db, "alumnos_autorizados", emailId));
        cargarAdminAlumnos();
    }
}

async function cargarAdminGestion() {
    const contenedor = document.getElementById("lista-gestion-temas");
    if(!contenedor) return;
    
    const snap = await getDocs(collection(db, "temas_globales"));
    if(snap.empty){
        contenedor.innerHTML = "<p>No has creado ningún módulo aún.</p>";
        return;
    }
    
    let html = "";
    snap.forEach(doc => {
        const d = doc.data();
        html += `
        <div class="admin-list-item" style="flex-direction: column; align-items: stretch; gap: 10px;">
            <div style="display:flex; justify-content: space-between; align-items:center;">
                <div>
                    <span style="background: var(--bg); padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; margin-right: 10px;">${d.materia}</span>
                    <strong>${d.titulo}</strong>
                </div>
                <button class="btn-outline" style="padding: 6px 12px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="eliminarTema('${doc.id}')"><i class="fas fa-trash"></i></button>
            </div>
            <div style="font-size: 13px; color: var(--text-light);">
                <i class="fab fa-youtube"></i> ${d.videos_recomendados ? d.videos_recomendados.length : 0} Videos | 
                <i class="fas fa-book-open"></i> ${d.lecturas_recomendadas ? d.lecturas_recomendadas.length : 0} Lecturas
            </div>
        </div>`;
    });
    contenedor.innerHTML = html;
}

window.eliminarTema = async function(id) {
    if(confirm("¿Eliminar este módulo definitivamente? Esto afectará a los alumnos que lo estén estudiando.")){
        await deleteDoc(doc(db, "temas_globales", id));
        cargarAdminGestion();
    }
}
// ======================================================================
// 🚀 PARCHE AUTOMÁTICO: EDICIÓN Y ORDEN DE MÓDULOS (Añadir al final)
// ======================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Inyectar visualmente el campo de "Orden" en el formulario sin tocar el HTML
    const grupoMateria = document.getElementById("input-materia").parentElement;
    grupoMateria.insertAdjacentHTML('afterend', `
        <div class="input-group" id="grupo-orden">
            <label>Orden de aparición (Número)</label>
            <input type="number" id="input-orden" class="input-text" placeholder="Ej: 1" value="1">
        </div>
    `);

    // Variable global para saber si estamos editando
    window.modoEdicionId = null;

    // 2. Secuestrar el botón original de "Procesar y Publicar" para cambiar su comportamiento
    const btnOriginal = document.getElementById("btn-generar-tema-admin");
    if (btnOriginal) {
        // Clonamos el botón para matar su evento original
        const btnNuevo = btnOriginal.cloneNode(true);
        btnOriginal.parentNode.replaceChild(btnNuevo, btnOriginal);
        
        // Añadimos el nuevo super-evento (Crea o Edita)
        btnNuevo.addEventListener("click", async () => {
            const materia = document.getElementById("input-materia").value;
            const tituloTema = document.getElementById("input-nuevo-tema").value.trim();
            const orden = parseInt(document.getElementById("input-orden").value) || 1;
            const videosRaw = document.getElementById("input-videos").value;
            const lecturasRaw = document.getElementById("input-lecturas").value;
            
            if (!tituloTema) return alert("El título es obligatorio.");
            
            const status = document.getElementById("admin-status");
            btnNuevo.disabled = true;
            status.style.color = "var(--primary-light)";
            status.innerHTML = window.modoEdicionId ? "<i class='fas fa-spinner fa-spin'></i> Actualizando tema..." : "<i class='fas fa-spinner fa-spin'></i> Generando resumen con IA y guardando links...";

            try {
                const extraerLinks = (texto) => texto.split('\n').filter(line => line.includes('http')).map(line => {
                    const parts = line.split('http');
                    let title = parts[0].replace(/^[\d\.\-\*]*\s*/, '').replace(/:\s*$/, '').trim();
                    return { titulo: title || "Enlace sugerido", url: 'http' + parts[1].trim() };
                });

                if (window.modoEdicionId) {
                    // ACTUALIZAR (usamos merge:true para NO borrar el resumen de IA original)
                    await setDoc(doc(db, "temas_globales", window.modoEdicionId), {
                        materia: materia, titulo: tituloTema, orden: orden,
                        videos_recomendados: extraerLinks(videosRaw),
                        lecturas_recomendadas: extraerLinks(lecturasRaw)
                    }, { merge: true });
                    
                    status.innerHTML = "<i class='fas fa-check'></i> Tema actualizado con éxito.";
                    btnNuevo.innerHTML = "<i class='fas fa-magic'></i> Procesar y Publicar Tema";
                    window.modoEdicionId = null;
                } else {
                    // CREAR NUEVO (Lógica original con IA y Orden incluido)
                    const promptText = `Actúa como profesor de ${materia}. Escribe un resumen introductorio de máximo 150 palabras para el tema: "${tituloTema}". Devuelve EXCLUSIVAMENTE un JSON con esta estructura exacta (sin formato markdown): { "resumen_teorico": "Tu texto aquí..." }`;
                    const res = await fetch('/.netlify/functions/gemini', {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ prompt: promptText, modelo: "gemini-3.6-flash" })
                    });
                    const data = await res.json();
                    const contenidoIA = JSON.parse(data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim());

                    await addDoc(collection(db, "temas_globales"), {
                        materia, titulo: tituloTema, orden, resumen_teorico: contenidoIA.resumen_teorico,
                        videos_recomendados: extraerLinks(videosRaw), lecturas_recomendadas: extraerLinks(lecturasRaw),
                        fecha_creacion: new Date().toISOString(), creador: usuarioActual.email
                    });
                    status.innerHTML = "<i class='fas fa-check'></i> Tema creado y guardado con éxito.";
                }

                status.style.color = "var(--success)";
                document.getElementById("input-nuevo-tema").value = "";
                document.getElementById("input-orden").value = "1";
                document.getElementById("input-videos").value = "";
                document.getElementById("input-lecturas").value = "";
                
                // Forzar recarga visual modificando el DOM
                document.getElementById("lista-gestion-temas").innerHTML = "Recargando...";
            } catch (error) {
                status.style.color = "var(--danger)";
                status.innerHTML = `<i class='fas fa-times'></i> Error: ${error.message}`;
            } finally {
                btnNuevo.disabled = false;
                setTimeout(() => status.innerHTML = "", 5000);
            }
        });
    }

    // 3. Interceptar la lista de temas del Admin para inyectar el botón de Editar y ordenarlos (MutationObserver)
    const containerAdmin = document.getElementById("lista-gestion-temas");
    if (containerAdmin) {
        new MutationObserver(async (mutations) => {
            if (containerAdmin.dataset.parcheado) return; // Evita bucle infinito
            containerAdmin.dataset.parcheado = "true";
            
            const snap = await getDocs(collection(db, "temas_globales"));
            let temasArray = [];
            snap.forEach(d => temasArray.push({ id: d.id, ...d.data() }));
            temasArray.sort((a, b) => (a.orden || 0) - (b.orden || 0)); // Orden matemático

            containerAdmin.innerHTML = temasArray.map(d => `
                <div class="admin-list-item" style="flex-direction: column; align-items: stretch; gap: 10px;">
                    <div style="display:flex; justify-content: space-between; align-items:center;">
                        <div>
                            <span style="background: var(--bg); padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; margin-right: 10px;">${d.materia} (Orden: ${d.orden || 0})</span>
                            <strong>${d.titulo}</strong>
                        </div>
                        <div>
                            <button class="btn-outline" style="padding: 6px 12px; font-size: 12px; color: var(--primary-light); border-color: var(--primary-light);" onclick="editarTema('${d.id}')"><i class="fas fa-edit"></i></button>
                            <button class="btn-outline" style="padding: 6px 12px; font-size: 12px; color: var(--danger); border-color: var(--danger);" onclick="eliminarTema('${d.id}')"><i class="fas fa-trash"></i></button>
                        </div>
                    </div>
                </div>`).join('');
            
            setTimeout(() => containerAdmin.dataset.parcheado = "", 200);
        }).observe(containerAdmin, { childList: true });
    }
});

// 4. Función global para cargar datos al formulario al presionar "Editar"
window.editarTema = async function(id) {
    const docSnap = await getDoc(doc(db, "temas_globales", id));
    if (docSnap.exists()) {
        const d = docSnap.data();
        document.getElementById("input-materia").value = d.materia;
        document.getElementById("input-nuevo-tema").value = d.titulo;
        document.getElementById("input-orden").value = d.orden || 1;
        document.getElementById("input-videos").value = d.videos_recomendados ? d.videos_recomendados.map(v => v.titulo + " " + v.url).join('\n') : "";
        document.getElementById("input-lecturas").value = d.lecturas_recomendadas ? d.lecturas_recomendadas.map(l => l.titulo + " " + l.url).join('\n') : "";
        
        window.modoEdicionId = id;
        document.getElementById("btn-generar-tema-admin").innerHTML = "<i class='fas fa-save'></i> Actualizar Tema (Sin usar IA)";
        window.switchAdmin('crear-tema'); 
        window.scrollTo(0, 0);
    }
}

// 5. Sobrescribir directamente la función de vista del alumno para que aplique el orden
window.abrirMateria = async function(materia) {
    materiaActual = materia;
    document.getElementById("titulo-materia-seleccionada").textContent = "Módulos de " + materia;
    
    // Función original de interfaz (mostrarSeccion) está encapsulada, simulamos el click
    document.querySelectorAll('.content-area > div').forEach(div => div.classList.add('hidden'));
    document.getElementById('lista-temas-section').classList.remove('hidden');
    window.scrollTo(0, 0);

    const contenedor = document.getElementById("student-temas-list");
    contenedor.innerHTML = "<p>Cargando módulos...</p>";

    const snap = await getDocs(query(collection(db, "temas_globales"), where("materia", "==", materia)));
    
    if (snap.empty) {
        contenedor.innerHTML = "<p style='grid-column: 1/-1;'>Pronto añadiremos módulos para esta materia.</p>";
    } else {
        let temasArray = [];
        snap.forEach(doc => temasArray.push({ id: doc.id, ...doc.data() }));
        temasArray.sort((a, b) => (a.orden || 0) - (b.orden || 0)); // Aplica el orden del admin

        contenedor.innerHTML = temasArray.map(data => `
            <div class="topic-card" onclick="abrirTemaEstudio('${data.id}', '${data.titulo.replace(/'/g, "\\'")}')">
                <div style="font-size: 24px; color: var(--primary-light); margin-bottom: 10px;">
                    <i class="fas fa-layer-group"></i>
                </div>
                <h3>${data.titulo}</h3>
                <p style="color: var(--text-light); font-size: 14px; margin: 0 0 15px 0;">Contiene resumen IA, recursos y simuladores.</p>
                <button class="btn-outline" style="width:100%; border-color: var(--border);">📖 Entrar al Módulo</button>
            </div>`).join('');
    }
}
