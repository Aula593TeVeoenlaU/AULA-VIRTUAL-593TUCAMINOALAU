import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, query, orderBy, where } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

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
let temaActualInfo = null; 
let quizActivo = null; 

// ==========================================
// CONTROL DE INTERFAZ
// ==========================================
function mostrarSeccion(id) {
    document.querySelectorAll('.content-area > div').forEach(div => div.classList.add('hidden'));
    const seccion = document.getElementById(id);
    if(seccion){
        seccion.classList.remove('hidden');
    }
    window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', function() {
    
    document.querySelectorAll('.btn-volver-dash').forEach(btn => {
        btn.addEventListener("click", () => mostrarSeccion(usuarioActual && usuarioActual.email === ADMIN_EMAIL ? "dashboard-section" : "dashboard-section"));
    });
    
    const btnIrAdmin = document.getElementById("btn-ir-admin");
    if(btnIrAdmin) btnIrAdmin.addEventListener("click", () => mostrarSeccion("admin-section"));
    
    const btnVerDash = document.getElementById("btn-ver-dash-como-alumno");
    if(btnVerDash) btnVerDash.addEventListener("click", () => mostrarSeccion("dashboard-section"));
    
    document.querySelectorAll('.btn-logout').forEach(btn => {
        btn.addEventListener("click", () => signOut(auth));
    });

    const btnLogin = document.getElementById("btn-login");
    if(btnLogin){
        btnLogin.addEventListener("click", () => {
            signInWithPopup(auth, provider).catch(err => alert("Error al iniciar sesión."));
        });
    }

    // Funciones del Administrador (Crear Temas)
    const btnGenerarTema = document.getElementById("btn-generar-tema-admin");
    if(btnGenerarTema){
        btnGenerarTema.addEventListener("click", async () => {
            const input = document.getElementById("input-nuevo-tema");
            const tituloTema = input.value.trim();
            if (!tituloTema) return alert("Escribe un tema válido.");
            
            const status = document.getElementById("admin-status");
            btnGenerarTema.disabled = true;
            status.style.color = "var(--primary-light)";
            status.textContent = "Generando contenido con IA... Esto tomará unos segundos.";

            try {
                const urlBusqueda = tituloTema.replace(/ /g, '+');
                const promptText = `Actúa como profesor universitario. Tema: "${tituloTema}".
                Devuelve EXCLUSIVAMENTE un JSON con esta estructura exacta (sin formato markdown \`\`\`json):
                {
                  "resumen_teorico": "Texto introductorio claro y conciso sobre el tema (máximo 100 palabras).",
                  "videos_recomendados": [
                    {"titulo": "Clase recomendada", "busqueda_youtube": "https://www.youtube.com/results?search_query=clase+universitaria+${urlBusqueda}"}
                  ],
                  "lecturas_gratuitas": [
                    {"titulo": "Concepto principal", "url": "https://es.wikipedia.org/wiki/Especial:Buscar?search=${urlBusqueda}"}
                  ]
                  Es importante mencionar que debes dar en total 4 videos de youtube y 4 lecturas de links directos que el alumno logre usar con solo pinchar y que sean de fuentes académicas buenas entre ellas siempre khan academy.
                }`;

                const response = await fetch('/.netlify/functions/gemini', {
                    method: "POST", 
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        prompt: promptText,
                        modelo: "gemini-3.8-flash"
                    })
                });

                const data = await response.json();
                
                // ESCUDO PROTECTOR PARA EVITAR QUE LA PÁGINA COLAPSE
                if (!data.candidates || data.candidates.length === 0) {
                    console.error("Detalle del error de Google:", data);
                    let msjError = "La IA no devolvió contenido.";
                    if(data.error && data.error.message) msjError = data.error.message;
                    throw new Error(msjError);
                }

                let rawText = data.candidates[0].content.parts[0].text;
                const contenidoBase = JSON.parse(rawText.replace(/```json/g, '').replace(/```/g, '').trim());

                const temaRef = collection(db, "temas_globales");
                await addDoc(temaRef, {
                    titulo: tituloTema,
                    contenido: contenidoBase,
                    fecha_creacion: new Date().toISOString(),
                    creador: usuarioActual.email
                });

                status.style.color = "var(--success)";
                status.textContent = "✅ Tema generado y publicado correctamente.";
                input.value = "";
                cargarTemasGlobales('admin');
                cargarTemasGlobales('alumno'); 
            } catch (error) {
                console.error(error);
                status.style.color = "var(--danger)";
                status.textContent = `❌ Error: ${error.message}`;
            } finally {
                btnGenerarTema.disabled = false;
            }
        });
    }

    // Generación de simuladores
    const btnGenerarSimulador = document.getElementById("btn-generar-simulador");
    if(btnGenerarSimulador){
        btnGenerarSimulador.addEventListener("click", async () => {
            const status = document.getElementById("simulador-status");
            
            const hoy = new Date().toISOString().split('T')[0];
            const limiteRef = doc(db, "usuarios", usuarioActual.uid, "limites", `${hoy}_${temaActualInfo.id}`);
            const limiteSnap = await getDoc(limiteRef);
            let generadosHoy = limiteSnap.exists() ? limiteSnap.data().cantidad : 0;

            if (generadosHoy >= 2) {
                status.textContent = "❌ Has alcanzado el límite de generar 2 simuladores nuevos de este tema por hoy.";
                return;
            }

            btnGenerarSimulador.disabled = true;
            status.style.color = "var(--primary)";
            status.textContent = "Generando simulador personalizado...";

            try {
                const promptText = `Actúa como creador de exámenes universitarios. Tema: "${temaActualInfo.titulo}".
                Genera un cuestionario de 5 preguntas de opción múltiple.
                Devuelve EXCLUSIVAMENTE un JSON con esta estructura exacta (sin markdown \`\`\`json):
                {
                  "preguntas": [
                    {
                      "enunciado": "Pregunta...",
                      "opciones": ["A) op1", "B) op2", "C) op3", "D) op4"],
                      "respuesta_correcta": 0,
                      "explicacion": "Breve justificación de la respuesta."
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
                
                // ESCUDO PROTECTOR PARA SIMULADORES
                if (!data.candidates || data.candidates.length === 0) {
                    console.error("Detalle del error de Google:", data);
                    let msjError = "La IA no devolvió las preguntas.";
                    if(data.error && data.error.message) msjError = data.error.message;
                    throw new Error(msjError);
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
                status.textContent = "✅ Simulador generado y guardado.";
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

    // Lógica del Quiz - Enviar
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
                } else {
                    divPreg.style.borderLeft = "6px solid var(--danger)";
                }
            });

            const divResult = document.getElementById("resultado-quiz");
            divResult.innerHTML = `Puntaje Final: <br><span style="font-size: 40px; font-weight: 800;">${puntaje} / ${quizActivo.length}</span>`;
            divResult.style.display = "block";
            
            btnEnviarQuiz.classList.add("hidden"); 
            document.getElementById("btn-volver-estudio-desde-quiz").classList.remove("hidden");
            window.scrollTo(0, document.body.scrollHeight);

            await addDoc(collection(db, "usuarios", usuarioActual.uid, "historial_pruebas"), {
                tema: temaActualInfo.titulo,
                fecha: new Date().toLocaleString(),
                puntaje: puntaje,
                total: quizActivo.length
            });
            cargarHistorialGlobal(); 

            fetch(`https://formsubmit.co/ajax/${CORREO_FORMSUBMIT}`, {
                method: "POST", headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ _subject: `Simulador Completado - ${usuarioActual.email}`, usuario: usuarioActual.email, tema: temaActualInfo.titulo, resultado: `${puntaje}/${quizActivo.length}` })
            }).catch(e => console.log("Error al enviar correo"));
        });
    }

    const btnVolverQuiz = document.getElementById("btn-volver-estudio-desde-quiz");
    if(btnVolverQuiz){
        btnVolverQuiz.addEventListener("click", () => mostrarSeccion("estudio-section"));
    }

}); 

// ==========================================
// AUTENTICACIÓN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        usuarioActual = user;
        const nombreUsr = document.getElementById("nombre-usuario");
        if(nombreUsr) nombreUsr.textContent = user.displayName;
        
        await setDoc(doc(db, "usuarios_registrados", user.uid), {
            nombre: user.displayName, email: user.email, ultimo_acceso: new Date().toISOString()
        }, { merge: true });

        const btnAdmin = document.getElementById("btn-ir-admin");
        if (user.email === ADMIN_EMAIL) {
            if(btnAdmin) btnAdmin.classList.remove("hidden");
            cargarTemasGlobales('admin');
            mostrarSeccion("admin-section");
        } else {
            if(btnAdmin) btnAdmin.classList.add("hidden");
            cargarTemasGlobales('alumno');
            cargarHistorialGlobal();
            mostrarSeccion("dashboard-section");
        }
    } else {
        usuarioActual = null;
        mostrarSeccion("login-section");
    }
});

// ==========================================
// FUNCIONES GLOBALES 
// ==========================================
async function cargarTemasGlobales(vista) {
    const contenedorAdmin = document.getElementById("admin-temas-list");
    const contenedorAlumno = document.getElementById("student-temas-list");
    
    if (vista === 'admin' && contenedorAdmin) contenedorAdmin.innerHTML = "Cargando...";
    if (vista === 'alumno' && contenedorAlumno) contenedorAlumno.innerHTML = "Cargando temas disponibles...";

    const snap = await getDocs(collection(db, "temas_globales"));
    let html = "";
    
    if (snap.empty) {
        html = "<p>No hay temas creados por el administrador aún.</p>";
    } else {
        snap.forEach(doc => {
            const data = doc.data();
            html += `
                <div class="topic-card">
                    <h3>${data.titulo}</h3>
                    <button onclick="abrirTema('${doc.id}', '${data.titulo}')" style="width:100%; margin-top: 10px;">
                        📖 Ingresar a Estudiar
                    </button>
                </div>`;
        });
    }

    if (vista === 'admin' && contenedorAdmin) contenedorAdmin.innerHTML = html;
    if (vista === 'alumno' && contenedorAlumno) contenedorAlumno.innerHTML = html;
}

window.abrirTema = async function(idGlobal, titulo) {
    temaActualInfo = { id: idGlobal, titulo: titulo };
    const tituloTemaDOM = document.getElementById("titulo-tema-estudio");
    if(tituloTemaDOM) tituloTemaDOM.textContent = titulo;
    mostrarSeccion("estudio-section");

    const docSnap = await getDoc(doc(db, "temas_globales", idGlobal));
    if (docSnap.exists()) {
        const data = docSnap.data().contenido;
        
        const contResumen = document.getElementById("contenido-resumen");
        if(contResumen && typeof marked !== 'undefined') {
            contResumen.innerHTML = marked.parse(data.resumen_teorico);
        } else if (contResumen) {
             contResumen.innerHTML = data.resumen_teorico;
        }
        
        const listaVid = document.getElementById("lista-videos");
        if(listaVid) {
            listaVid.innerHTML = data.videos_recomendados.map(v => 
            `<li>🎬 <a href="${v.busqueda_youtube}" target="_blank">${v.titulo}</a></li>`).join('');
        }
            
        const listaLec = document.getElementById("lista-lecturas");
        if(listaLec){
             listaLec.innerHTML = data.lecturas_gratuitas.map(l => 
            `<li>📄 <a href="${l.url}" target="_blank">${l.titulo}</a></li>`).join('');
        }
    }

    cargarMisSimuladores();
}

async function cargarMisSimuladores() {
    const contenedor = document.getElementById("lista-mis-simuladores");
    if(!contenedor) return;
    
    contenedor.innerHTML = "Cargando tus simuladores...";
    
    const q = query(
        collection(db, "usuarios", usuarioActual.uid, "simuladores_guardados"),
        where("tema_id", "==", temaActualInfo.id)
    );
    
    const snap = await getDocs(q);
    if (snap.empty) {
        contenedor.innerHTML = "<p style='grid-column: 1/-1;'>No has generado simuladores para este tema aún.</p>";
        return;
    }

    let html = "";
    let cont = 1;
    snap.forEach(doc => {
        const data = doc.data();
        const safePreguntas = JSON.stringify(data.preguntas).replace(/'/g, "&apos;").replace(/"/g, "&quot;");
        const btnHtml = `<button class="btn-outline" style="width: 100%; padding: 15px;" onclick="iniciarQuiz(${safePreguntas})">📝 Simulador #${cont}</button>`;
        html += btnHtml;
        cont++;
    });
    contenedor.innerHTML = html;
}

window.iniciarQuiz = function(preguntas) {
    quizActivo = preguntas;
    
    const tituloTemaQuiz = document.getElementById("quiz-tema-titulo");
    if(tituloTemaQuiz) tituloTemaQuiz.textContent = "Tema: " + temaActualInfo.titulo;
    
    const btnEnviar = document.getElementById("btn-enviar-quiz");
    if(btnEnviar) btnEnviar.classList.remove("hidden"); 
    
    const btnVolver = document.getElementById("btn-volver-estudio-desde-quiz");
    if(btnVolver) btnVolver.classList.add("hidden");
    
    const resQuiz = document.getElementById("resultado-quiz");
    if(resQuiz) resQuiz.style.display = "none";
    
    const contenedor = document.getElementById("contenedor-preguntas");
    if(!contenedor) return;
    
    contenedor.innerHTML = "";

    quizActivo.forEach((p, index) => {
        let opcionesHtml = p.opciones.map((opc, i) => `
            <div class="opcion">
                <label><input type="radio" name="q${index}" value="${i}"> ${opc}</label>
            </div>
        `).join('');

        contenedor.innerHTML += `
            <div class="pregunta" id="div-q${index}">
                <p style="font-size: 1.1em; font-weight: bold; color: var(--primary);">Pregunta ${index + 1}: ${p.enunciado}</p>
                ${opcionesHtml}
                <div class="hidden explicacion" id="exp-q${index}" style="background: #EBF8FF; padding: 15px; border-radius: 8px; margin-top: 15px; border-left: 4px solid var(--secondary);">
                    <p style="margin:0;">💡 <strong>Justificación:</strong> ${p.explicacion}</p>
                </div>
            </div>
        `;
    });
    
    // Disparador para renderizar fórmulas matemáticas en caso de usar LaTeX
    if (window.MathJax) {
        MathJax.typesetPromise();
    }
    
    mostrarSeccion("quiz-section");
}

async function cargarHistorialGlobal() {
    const contenedor = document.getElementById("lista-historial-global");
    if (!usuarioActual || !contenedor) return;
    
    const snap = await getDocs(collection(db, "usuarios", usuarioActual.uid, "historial_pruebas"));
    if (snap.empty) {
        contenedor.innerHTML = "<li>Aún no has resuelto ningún simulador.</li>";
        return;
    }

    let historial = [];
    snap.forEach(doc => historial.push(doc.data()));
    historial.reverse(); 

    contenedor.innerHTML = historial.map(h => 
        `<li>
            <div style="flex:1"><strong>${h.tema}</strong></div>
            <div style="color: #A0AEC0; font-size: 14px; margin-right: 15px;">${h.fecha}</div>
            <div style="background: var(--primary-light); color: white; padding: 5px 12px; border-radius: 20px; font-weight: bold; font-size: 14px;">
                ${h.puntaje} / ${h.total}
            </div>
        </li>`
    ).join('');
}
