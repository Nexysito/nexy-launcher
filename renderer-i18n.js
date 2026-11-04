'use strict';

/* NexyLauncher 1.0 — cambio de idioma español / inglés.
   Traduce la interfaz por texto: no hace falta tocar cada plantilla.
   Los textos nuevos que genera el renderer se traducen solos. */
(() => {
  const App = window.NexyApp;
  const { state } = App;

  const EN = {
    /* ---------- Navegación y barra superior ---------- */
    "Inicio": "Home",
    "Instancias": "Instances",
    "Mods": "Mods",
    "Servidores": "Servers",
    "Contenido": "Content",
    "Asistente": "Assistant",
    "Ajustes": "Settings",
    "Invitado": "Guest",
    "Jugando": "Playing",
    "Ver estado del lanzamiento": "View launch status",
    "Java detectado": "Java detected",
    "Abrir consola": "Open console",
    "Gestionar cuenta": "Manage account",
    "Cambiar de instancia": "Switch instance",
    "Cambiar idioma": "Change language",
    "Español": "Spanish",
    "Inglés": "English",

    /* ---------- Inicio ---------- */
    "PANEL PRINCIPAL": "MAIN PANEL",
    "JUGANDO COMO": "PLAYING AS",
    "JUGAR": "PLAY",
    "Entra a jugar": "Go play",
    "Jugador": "Player",
    "Jugando ahora": "Now playing",
    "En espera": "Idle",
    "Listo para jugar": "Ready to play",
    "Preparando Minecraft": "Preparing Minecraft",
    "Deteniendo Minecraft": "Stopping Minecraft",
    "Minecraft en ejecución": "Minecraft running",
    "Sesión finalizada": "Session ended",
    "VERSIÓN DE MINECRAFT": "MINECRAFT VERSION",
    "VERSIÓN DEL CARGADOR": "LOADER VERSION",
    "CARGADOR": "LOADER",
    "Todos los cargadores": "All loaders",
    "Juego rápido": "Quick play",
    "Servidor": "Server",
    "Jugar en el servidor": "Join server",
    "Añadir servidor": "Add server",
    "Nueva versión disponible:": "New version available:",
    "Descarga la nueva versión para seguir al día.": "Download the new version to stay up to date.",
    "Descargar": "Download",
    "Más tarde": "Later",
    "Novedades": "What's new",
    "Información y consejos": "Info and tips",
    "Comunidad": "Community",
    "Ayuda y feedback": "Help & feedback",
    "Discord · Próximamente": "Discord · Coming soon",
    "MD: zombigamer55": "DM: zombigamer55",
    "Formulario": "Form",
    "Diagnóstico": "Diagnostics",
    "Logs": "Logs",
    "Cuentas offline": "Offline accounts",
    "Sin telemetría ni inicio de sesión externo. Tus perfiles y ajustes se quedan en tu PC.": "No telemetry or external sign-in. Your profiles and settings stay on your PC.",
    "Asistente de ayuda": "Help assistant",
    "Chat integrado para resolver dudas, revisar crashes y aplicar arreglos automáticos.": "Built-in chat to answer questions, review crashes and apply automatic fixes.",
    "Integración de Modrinth": "Modrinth integration",
    "Busca, instala y actualiza mods desde Modrinth en cada instancia.": "Search, install and update mods from Modrinth in each instance.",
    "Comunidad y feedback": "Community & feedback",
    "Formulario, contacto por Discord, diagnóstico y logs desde Inicio y Ajustes.": "Form, Discord contact, diagnostics and logs from Home and Settings.",
    "Info and tips": "Info and tips",

    /* ---------- Juego / versiones ---------- */
    "Versiones instaladas en este equipo": "Versions installed on this PC",
    "Elige una versión y pulsa jugar. Descargamos automáticamente todo lo necesario.": "Pick a version and press play. We download everything you need automatically.",
    "Elige una versión para jugar": "Pick a version to play",
    "No hay versiones disponibles": "No versions available",
    "No hay conexión a internet": "No internet connection",
    "Cargando todas las versiones…": "Loading all versions…",
    "Actualizar": "Update",
    "Actualizaciones": "Updates",
    "Buscar actualizaciones": "Check for updates",
    "Estás al día": "You're up to date",
    "Sin comprobar": "Not checked",
    "No se pudo comprobar": "Couldn't check",
    "No se pudo comprobar si hay actualizaciones.": "Couldn't check for updates.",
    "Comprobación fallida": "Check failed",
    "Actualización disponible": "Update available",
    "Descarga no disponible": "Download unavailable",
    "Descargando actualización": "Downloading update",
    "No se pudo abrir el enlace de descarga.": "Couldn't open the download link.",
    "No se pudo abrir el enlace": "Couldn't open the link",
    "Ya tienes la última versión de NexyLauncher.": "You already have the latest NexyLauncher version.",
    "Sin versión seleccionada": "No version selected",
    "Selecciona una versión": "Select a version",
    "Vanilla": "Vanilla",
    "Solo Minecraft Vanilla. Elige un cargador para usar mods.": "Vanilla Minecraft only. Pick a loader to use mods.",
    "Solo Minecraft Vanilla. Elige un cargador para poder usar mods.": "Vanilla Minecraft only. Pick a loader to use mods.",
    "Elige una versión de Minecraft para ver las versiones del cargador.": "Pick a Minecraft version to see loader versions.",
    "Elige una versión del cargador.": "Pick a loader version.",
    "Espera a que carguen las versiones del cargador.": "Wait for the loader versions to load.",
    "No se pudo cambiar la versión": "Couldn't change the version",
    "No hay ninguna versión seleccionada. Elige una versión en Inicio.": "No version selected. Pick one on Home.",
    "Cargador sin elegir": "No loader selected",
    "Sin versión": "No version",
    "Sin versión asignada": "No version assigned",
    "Versión incompatible": "Incompatible version",
    "Versión sin nombre": "Unnamed version",
    "Modelo sin nombre": "Unnamed model",
    "Versión y cargador": "Version and loader",
    "Todas las versiones": "All versions",
    "todas las versiones": "all versions",
    "todos los cargadores": "all loaders",

    /* ---------- Instancias ---------- */
    "INSTANCIA": "INSTANCE",
    "Instancia activa:": "Active instance:",
    "Nueva instancia": "New instance",
    "No hay instancias": "No instances",
    "Crea una instancia para separar versiones, mods y mundos.": "Create an instance to separate versions, mods and worlds.",
    "Cada instancia guarda sus propias versiones, mods, mundos, recursos y ajustes de Minecraft. Cambia de instancia sin mezclar nada.": "Each instance keeps its own Minecraft versions, mods, worlds, resources and settings. Switch instances without mixing anything.",
    "Tendrá su propia carpeta con versiones, mods, mundos y ajustes.": "It will have its own folder with versions, mods, worlds and settings.",
    "La descripción es opcional y se muestra en la tarjeta de la instancia.": "The description is optional and shows on the instance card.",
    "La instancia conservará sus mods, mundos y ajustes.": "The instance will keep its mods, worlds and settings.",
    "Ponle un nombre a la instancia.": "Give the instance a name.",
    "Nombre y descripción": "Name and description",
    "Nombre y descripción guardados.": "Name and description saved.",
    "Descripción": "Description",
    "Principal": "Main",
    "Cambiar carpeta": "Change folder",
    "Cambiar de carpeta no mueve los archivos existentes. Cada instancia tiene su propia carpeta de versiones, mods y mundos.": "Changing the folder does not move existing files. Each instance has its own versions, mods and worlds folder.",
    "Carpeta de la instancia activa": "Active instance folder",
    "Carpeta de la instancia actualizada.": "Instance folder updated.",
    "No se pudo cambiar la carpeta": "Couldn't change the folder",
    "Carpeta": "Folder",
    "Carpeta de datos": "Data folder",
    "Abrir carpeta": "Open folder",
    "No se pudo abrir la carpeta": "Couldn't open the folder",
    "Importar": "Import",
    "Exportar": "Export",
    "Duplicar": "Duplicate",
    "Eliminar": "Delete",
    "Verificar": "Verify",
    "Reparar": "Repair",
    "Comprobar estado": "Check status",
    "Comprobando archivos…": "Checking files…",
    "Revisión necesaria": "Review needed",
    "Configuración limpia": "Clean configuration",
    "Todo en orden. La instancia está lista para jugar.": "All good. The instance is ready to play.",
    "Quedan incidencias pendientes. Revisa la lista de la ventana.": "Some issues remain. Check the list in the window.",
    "Reparación completada.": "Repair completed.",
    "No se pudo reparar": "Couldn't repair",
    "Preparando la reparación…": "Preparing repair…",
    "Comprueba la versión base, el cargador, las librerías y los recursos del juego.": "Checks the base version, loader, libraries and game assets.",
    "Verificar y reparar los archivos de la instancia": "Verify and repair the instance files",
    "Recursos del juego": "Game assets",
    "Librerías": "Libraries",
    "Falta el índice de recursos": "Missing asset index",
    "Falta el cargador o su perfil.": "Missing loader or profile.",
    "Se descargará al jugar": "Will download when playing",
    "Se instalará al jugar": "Will install when playing",
    "No se pudo crear la instancia": "Couldn't create the instance",
    "No se pudo duplicar": "Couldn't duplicate",
    "No se pudo eliminar": "Couldn't delete",
    "No se pudo exportar": "Couldn't export",
    "No se pudo importar": "Couldn't import",
    "Importación parcial": "Partial import",
    "Exportación completada": "Export completed",
    "Debe quedar al menos una instancia.": "At least one instance must remain.",
    "Se copian mods, ajustes y recursos. Las versiones se descargan de nuevo al jugar.": "Mods, settings and resources are copied. Versions are downloaded again when you play.",
    "Se admiten .mrpack de Modrinth, ZIP de CurseForge y exportaciones de NexyLauncher.": "Supports Modrinth .mrpack, CurseForge ZIP and NexyLauncher exports.",
    "Genera un modpack con los mods, configuraciones y recursos de esta instancia.": "Build a modpack with this instance's mods, configs and resources.",
    "Incluir datos del launcher": "Include launcher data",
    "Se enviarán datos de tu instancia, mods y ajustes.": "Your instance, mods and settings data will be sent.",
    "Almacenamiento": "Storage",
    "Dónde viven tus partidas y mods": "Where your saves and mods live",
    "No borra partidas, versiones ni mods": "Doesn't delete saves, versions or mods",

    /* ---------- Mods ---------- */
    "Descubrir": "Discover",
    "Descubrir mods": "Discover mods",
    "Instalados": "Installed",
    "Instalar": "Install",
    "Buscar": "Search",
    "Busca en": "Search in",
    "Busca tu próximo mod": "Find your next mod",
    "Escribe un nombre o explora los mods más descargados de la versión seleccionada.": "Type a name or browse the most downloaded mods for the selected version.",
    "Escribe un nombre o pulsa Buscar para explorar los mods más descargados.": "Type a name or press Search to browse the most downloaded mods.",
    "Elige una versión y un cargador para ver solo mods compatibles.": "Pick a version and a loader to see only compatible mods.",
    "Activa, desactiva y organiza tus .jar.": "Enable, disable and organize your .jar files.",
    "Añade archivos .jar o descubre mods compatibles desde la pestaña Descubrir.": "Add .jar files or discover compatible mods from the Discover tab.",
    "Añadir mods": "Add mods",
    "Arrastra tus mods aquí": "Drag your mods here",
    "Arrastra archivos con extensión .jar.": "Drag .jar files here.",
    "selecciona archivos .jar": "select .jar files",
    "En la carpeta mods": "In the mods folder",
    "Todavía no hay mods": "No mods yet",
    "Carpeta mods vacía": "Mods folder empty",
    "Mods bajo control": "Mods under control",
    "Mods con instalación integrada": "Mods with built-in installation",
    "Mods e integraciones": "Mods & integrations",
    "Descargas desde Modrinth y CurseForge": "Downloads from Modrinth and CurseForge",
    "Modrinth es gratis y no necesita registro. CurseForge ofrece más catálogo, pero requiere una clave personal.": "Modrinth is free and needs no registration. CurseForge offers a bigger catalogue but requires a personal key.",
    "Modrinth · sin cuenta": "Modrinth · no account",
    "CurseForge · API key": "CurseForge · API key",
    "API key de CurseForge (opcional)": "CurseForge API key (optional)",
    "API key del asistente": "Assistant API key",
    "Obtener una API key": "Get an API key",
    "Proveedor predeterminado": "Default provider",
    "CurseForge está desactivado": "CurseForge is disabled",
    "Escribe primero tu API key de CurseForge.": "Enter your CurseForge API key first.",
    "No se pudo buscar mods": "Couldn't search for mods",
    "No se pudo abrir Modrinth": "Couldn't open Modrinth",
    "No se pudo cargar la información del mod.": "Couldn't load mod information.",
    "No se encontró esa versión del mod.": "That mod version wasn't found.",
    "No se pudieron añadir mods": "Couldn't add mods",
    "No se pudieron añadir los mods": "Couldn't add the mods",
    "No se pudieron leer los mods": "Couldn't read the mods",
    "No se pudieron leer los mods.": "Couldn't read the mods.",
    "No se pudo instalar el mod": "Couldn't install the mod",
    "No se pudo eliminar el mod": "Couldn't delete the mod",
    "No se pudo cambiar el mod": "Couldn't change the mod",
    "No se pudieron actualizar los mods": "Couldn't update the mods",
    "No se pudieron comprobar las actualizaciones": "Couldn't check for updates",
    "No se pudo actualizar": "Couldn't update",
    "Mod añadido": "Mod added",
    "Mods añadidos": "Mods added",
    "Añadido con avisos": "Added with warnings",
    "Nada añadido": "Nothing added",
    "Contenido añadido": "Content added",
    "Actualizar seleccionados": "Update selected",
    "Selecciona al menos una actualización.": "Select at least one update.",
    "Comprueba si hay versiones nuevas compatibles con esta instancia.": "Check for new versions compatible with this instance.",
    "Asigna una versión de Minecraft a la instancia antes de instalar mods.": "Assign a Minecraft version to the instance before installing mods.",
    "Asigna una versión de Minecraft a la instancia para buscar mods compatibles.": "Assign a Minecraft version to the instance to search compatible mods.",
    "Asigna una versión de Minecraft a la instancia para comprobar actualizaciones compatibles.": "Assign a Minecraft version to the instance to check compatible updates.",
    "Esta instancia es Vanilla. Cambia el cargador para poder instalar mods.": "This instance is Vanilla. Change the loader to install mods.",
    "Sin cargador de mods.": "No mod loader.",
    "Los archivos no son .jar válidos o superan el tamaño máximo.": "Files are not valid .jar or exceed the maximum size.",
    "Archivo no válido": "Invalid file",
    "Catálogo guardado en caché": "Catalogue cached",
    "Seleccionar": "Select",
    "Quitar": "Remove",
    "Carátula actualizada.": "Cover updated.",
    "Carátula eliminada.": "Cover removed.",
    "No se pudo cambiar la carátula": "Couldn't change the cover",
    "No se pudo quitar la carátula": "Couldn't remove the cover",
    "Quitar carátula": "Remove cover",
    "Galería": "Gallery",
    "Sin descripción disponible.": "No description available.",
    "¿Eliminar el mod?": "Delete the mod?",
    "¿Eliminar este mod?": "Delete this mod?",
    "¿Eliminar el archivo?": "Delete the file?",

    /* ---------- Servidores ---------- */
    "Añadir un servidor": "Add a server",
    "Añadir mi primer servidor": "Add my first server",
    "Aún no tienes servidores guardados.": "You don't have any saved servers yet.",
    "Tu lista de servidores está vacía": "Your server list is empty",
    "Guarda tus servidores favoritos y entra con un solo clic.": "Save your favourite servers and join with one click.",
    "Guarda tus servidores favoritos para entrar con un clic desde el inicio.": "Save your favourite servers to join with one click from Home.",
    "Entra directamente a un servidor": "Join a server directly",
    "Añade una dirección para guardarla y poder conectarte directamente desde el inicio.": "Add an address to save it and connect directly from Home.",
    "Escribe un nombre para identificar el servidor.": "Enter a name to identify the server.",
    "Dirección no válida. Ejemplo: play.ejemplo.net o play.ejemplo.net:25565.": "Invalid address. Example: play.example.net or play.example.net:25565.",
    "Servidor añadido": "Server added",
    "Servidor añadido a tu lista.": "Server added to your list.",
    "Servidor de Discord": "Discord server",
    "El servidor de la comunidad estará disponible próximamente": "The community server will be available soon",
    "Elige un servidor de la lista.": "Pick a server from the list.",
    "En línea": "Online",
    "Sin conexión": "Offline",
    "Comprobando…": "Checking…",

    /* ---------- Contenido ---------- */
    "Mundos": "Worlds",
    "Mundos, resource packs, shaders y capturas de la instancia activa.": "Worlds, resource packs, shaders and screenshots of the active instance.",
    "Todavía no hay mundos": "No worlds yet",
    "Crea un mundo en Minecraft y aparecerá aquí.": "Create a world in Minecraft and it will show up here.",
    "No se pudo abrir el mundo": "Couldn't open the world",
    "Resource packs": "Resource packs",
    "Shaders": "Shaders",
    "Añade archivos .zip para cambiar texturas y modelos.": "Add .zip files to change textures and models.",
    "Añade archivos .zip compatibles con Iris u OptiFine.": "Add .zip files compatible with Iris or OptiFine.",
    "Capturas": "Screenshots",
    "Pulsa F2 en Minecraft y aparecerán en esta galería.": "Press F2 in Minecraft and they'll appear in this gallery.",
    "Vista previa de la captura de Minecraft.": "Minecraft screenshot preview.",
    "No se pudo abrir la captura": "Couldn't open the screenshot",
    "¿Eliminar la captura?": "Delete the screenshot?",
    "No hay archivos en esta sección.": "No files in this section.",
    "Los archivos no son .zip válidos o superan el tamaño máximo.": "Files are not valid .zip or exceed the maximum size.",
    "No se pudieron añadir archivos": "Couldn't add files",
    "Copias": "Backups",
    "¿Eliminar la copia?": "Delete the backup?",
    "¿Restaurar la copia?": "Restore the backup?",
    "No se pudo crear la copia": "Couldn't create the backup",
    "No se pudo restaurar": "Couldn't restore",
    "Se borrará el mundo completo. Crea antes una copia de seguridad si quieres conservarlo.": "The whole world will be deleted. Create a backup first if you want to keep it.",

    /* ---------- Ajustes ---------- */
    "Configura el rendimiento, Java, la apariencia y el almacenamiento del launcher.": "Configure performance, Java, appearance and launcher storage.",
    "Rendimiento": "Performance",
    "Apariencia": "Appearance",
    "Memoria": "Memory",
    "Memoria RAM asignada": "Allocated RAM",
    "Memoria y argumentos de la JVM": "Memory and JVM arguments",
    "Argumentos JVM": "JVM arguments",
    "Argumentos del juego": "Game arguments",
    "Flags recomendados": "Recommended flags",
    "Flags de Aikar eliminados.": "Aikar flags removed.",
    "Se añadieron los flags recomendados de Aikar para G1GC.": "Recommended Aikar flags for G1GC were added.",
    "Cambiar los argumentos JVM": "Change the JVM arguments",
    "Deja margen para el sistema. Más memoria no siempre significa más FPS.": "Leave headroom for the system. More memory doesn't always mean more FPS.",
    "Mínimo": "Min",
    "Máximo": "Max",
    "Alto": "Height",
    "Ancho": "Width",
    "Resolución de Minecraft": "Minecraft resolution",
    "Pantalla completa": "Fullscreen",
    "Inicia Minecraft en modo fullscreen": "Launch Minecraft in fullscreen",
    "Ventana y lanzamiento": "Window & launch",
    "Minimizar al iniciar el juego": "Minimize when the game starts",
    "Libera la pantalla cuando Minecraft arranca": "Free up the screen when Minecraft starts",
    "Iniciar sesión automáticamente": "Sign in automatically",
    "Entra directo con tu último perfil al abrir el launcher": "Sign in with your last profile when the launcher opens",
    "Java": "Java",
    "Java para Minecraft": "Java for Minecraft",
    "Java automático": "Automatic Java",
    "Java (Adoptium)": "Java (Adoptium)",
    "Detectando Java…": "Detecting Java…",
    "Detectando instalaciones de Java en el sistema…": "Detecting Java installations on the system…",
    "No se detectó Java. Instálalo o elige una ruta manual en Ajustes → Java.": "Java wasn't detected. Install it or choose a manual path in Settings → Java.",
    "No se detectó ninguna instalación": "No installation detected",
    "No se encontró Java en las rutas habituales. Puedes seleccionarlo manualmente.": "Java wasn't found in the usual paths. You can select it manually.",
    "No se encontró ninguna instalación de Java.": "No Java installation found.",
    "Error al detectar Java": "Error detecting Java",
    "Detección completada": "Detection completed",
    "Examinar": "Browse",
    "Descarga Temurin (gratis y sin cuenta)": "Download Temurin (free, no account)",
    "Abrir Adoptium": "Open Adoptium",
    "No se pudo instalar Java": "Couldn't install Java",
    "No se pudo elegir Java": "Couldn't choose Java",
    "Java no detectado": "Java not detected",
    "Java no encontrado": "Java not found",
    "Java no válido": "Invalid Java",
    "En automático se elige la mejor versión disponible para cada versión de Minecraft.": "Automatic mode picks the best available Java for each Minecraft version.",
    "memoria propia de la instancia": "instance's own memory",
    "no detectado": "not detected",
    "Tema de acento": "Accent theme",
    "Color principal de botones y detalles": "Main color for buttons and details",
    "Hazlo tuyo": "Make it yours",
    "No se pudo abrir la carpeta de logs": "Couldn't open the logs folder",
    "Abrir logs": "Open logs",
    "Ver logs": "View logs",
    "Registros": "Logs",
    "Abre la carpeta de logs para adjuntar el último registro": "Open the logs folder to attach the latest log",
    "Diagnóstico del sistema": "System diagnostics",
    "Copia versión, Java, instancia y mods para pegarlos al pedir ayuda": "Copy version, Java, instance and mods to paste when asking for help",
    "Copiar": "Copy",
    "Diagnóstico copiado. Pégalo en Discord o en el formulario.": "Diagnostics copied. Paste it in Discord or the form.",
    "Informe copiado al portapapeles.": "Report copied to the clipboard.",
    "Contenido de la consola copiado al portapapeles.": "Console content copied to the clipboard.",
    "No hay texto que copiar.": "There's no text to copy.",
    "El portapapeles no está disponible.": "The clipboard is not available.",
    "No se pudo copiar": "Couldn't copy",
    "Restablecer": "Reset",
    "Restablecer ajustes": "Reset settings",
    "Ajustes restablecidos a los valores recomendados.": "Settings reset to recommended values.",
    "¿Restablecer todos los ajustes?": "Reset all settings?",
    "No se pudo restablecer": "Couldn't reset",
    "Guardado": "Saved",
    "Error al guardar": "Error saving",
    "No se pudo guardar": "Couldn't save",
    "No se pudieron guardar los ajustes": "Couldn't save the settings",
    "Mostrar snapshots": "Show snapshots",
    "Incluye versiones de desarrollo en el catálogo": "Include development versions in the catalogue",
    "Se aplica al iniciar el juego": "Applied when the game starts",
    "Opcional · parámetros adicionales para Minecraft": "Optional · extra Minecraft parameters",
    "Opcional · se añaden al iniciar Minecraft": "Optional · added when Minecraft starts",

    /* ---------- Asistente ---------- */
    "Asistente de IA": "AI assistant",
    "Ajustes IA": "AI settings",
    "Nueva conversación": "New conversation",
    "Pregunta lo que quieras sobre tu launcher, tus mods o un crash. Usa tu propia API key.": "Ask anything about your launcher, your mods or a crash. Use your own API key.",
    "Tu propia API key, sin intermediarios": "Your own API key, no middlemen",
    "Se guarda solo en este equipo y se envía únicamente al proveedor que elijas. Compatible con OpenAI y APIs compatibles.": "Stored only on this PC and sent only to the provider you choose. Works with OpenAI and compatible APIs.",
    "Se guarda solo en este equipo y se envía únicamente al proveedor que elijas.": "Stored only on this PC and sent only to the provider you choose.",
    "La API key se guarda solo en este equipo.": "The API key is stored only on this PC.",
    "Puedes usar OpenRouter, Groq, Ollama u otro servicio compatible con": "You can use OpenRouter, Groq, Ollama or any service compatible with",
    "Modelo": "Model",
    "URL base": "Base URL",
    "Probar": "Test",
    "Borrar clave": "Delete key",
    "Borra la API key de este equipo": "Delete the API key from this PC",
    "Clave guardada": "Key saved",
    "Sin configurar": "Not configured",
    "Falta la clave": "Missing key",
    "Falta la API key": "Missing API key",
    "La API key no funciona": "The API key doesn't work",
    "Conexión correcta": "Connection successful",
    "No se pudo borrar la clave": "Couldn't delete the key",
    "API key eliminada de este equipo.": "API key deleted from this PC.",
    "API key guardada en este equipo. Pulsa Probar para comprobar que funciona.": "API key saved on this PC. Press Test to check it works.",
    "API key guardada en este equipo. Solo se envía al proveedor configurado.": "API key saved on this PC. It's only sent to the configured provider.",
    "API key lista. Pulsa Probar para comprobar que funciona.": "API key ready. Press Test to check it works.",
    "API key válida y guardada en este equipo.": "API key valid and saved on this PC.",
    "Escribe primero tu API key del asistente.": "Enter your assistant API key first.",
    "Configura tu API key en Ajustes → Asistente de IA para usar el asistente.": "Set your API key in Settings → AI assistant to use the assistant.",
    "Configura tu API key en Ajustes → Asistente de IA para que la IA pueda leer el registro.": "Set your API key in Settings → AI assistant so the AI can read the log.",
    "El asistente no pudo responder": "The assistant couldn't answer",
    "No se pudo conectar con el asistente": "Couldn't connect to the assistant",
    "Análisis de crashes": "Crash analysis",
    "Leer crashes automáticamente": "Read crashes automatically",
    "Si está activo, la IA recibe el registro sin preguntar y gasta tokens": "If enabled, the AI receives the log without asking and spends tokens",
    "Registro ignorado. No se ha enviado nada a la IA.": "Log ignored. Nothing was sent to the AI.",
    "No se enviará contexto del launcher.": "No launcher context will be sent.",
    "Arreglo de la IA": "AI fix",
    "Deshacer arreglo": "Undo fix",
    "No hay ningún arreglo de la IA que deshacer.": "There's no AI fix to undo.",
    "Se restauró el estado anterior al arreglo de la IA.": "The state before the AI fix was restored.",
    "No se pudo aplicar el arreglo": "Couldn't apply the fix",
    "No se pudo aplicar ningún cambio.": "Couldn't apply any changes.",
    "Se recuperó el estado anterior al arreglo": "Restored the state before the fix",
    "¿Restaurar antes del arreglo?": "Restore before the fix?",
    "Sesión detectada al abrir el launcher.": "Session detected when opening the launcher.",
    "¿Qué versión de Java necesita mi instancia?": "What Java version does my instance need?",
    "¿Qué puedo hacer si Minecraft no arranca?": "What can I do if Minecraft won't start?",
    "¿Cómo mejoro los FPS sin romper los mods?": "How do I improve FPS without breaking mods?",
    "Extracto del registro": "Log excerpt",
    "Registro de crash adjunto": "Crash log attached",
    "Sin archivos de registro": "No log files",
    "No se pudo abrir el log": "Couldn't open the log",
    "Revisa la consola para más detalles.": "Check the console for more details.",
    "Revisa las recomendaciones antes de volver a iniciar el juego.": "Review the recommendations before launching the game again.",
    "Si el juego sigue fallando, revisa el extracto del registro o comparte el diagnóstico.": "If the game keeps failing, check the log excerpt or share the diagnostics.",

    /* ---------- Lanzamiento / consola ---------- */
    "Consola": "Console",
    "Detener": "Stop",
    "Limpiar": "Clear",
    "La consola está vacía todavía.": "The console is still empty.",
    "No hay ningún juego que detener.": "There's no game to stop.",
    "No se pudo iniciar Minecraft": "Couldn't start Minecraft",
    "No se pudo iniciar Minecraft.": "Couldn't start Minecraft.",
    "No se pudo iniciar la instancia": "Couldn't start the instance",
    "Error de lanzamiento": "Launch error",
    "Error al iniciar": "Error starting",
    "Error de inicio": "Startup error",
    "Error de instancia": "Instance error",
    "Minecraft se cerró correctamente.": "Minecraft closed successfully.",
    "Minecraft se está ejecutando. Puedes volver cuando quieras.": "Minecraft is running. You can come back anytime.",
    "Minecraft ya está en marcha. Revisa la consola si necesitas detalles.": "Minecraft is already running. Check the console if you need details.",
    "Minecraft ya se está ejecutando desde este launcher.": "Minecraft is already running from this launcher.",
    "Se detectó una sesión de Minecraft en marcha.": "A running Minecraft session was detected.",
    "Cierra Minecraft antes de cerrar la sesión.": "Close Minecraft before signing out.",
    "No cambies la carpeta del juego mientras Minecraft está en marcha.": "Don't change the game folder while Minecraft is running.",
    "Conexión disponible": "Connection available",
    "Preparando el cargador…": "Preparing the loader…",
    "Preparando el modpack…": "Preparing the modpack…",
    "Comprobando Java y archivos del juego…": "Checking Java and game files…",
    "Deteniendo…": "Stopping…",

    /* ---------- Cuenta / avisos ---------- */
    "Perfiles guardados": "Saved profiles",
    "Nombre de jugador": "Player name",
    "Iniciar sesión": "Sign in",
    "Entrar al launcher": "Enter the launcher",
    "Haz clic para entrar": "Click to enter",
    "Escoje un perfil": "Choose a profile",
    "Elige un perfil de jugador para poder jugar.": "Choose a player profile to play.",
    "Inicia sesión para gestionar tu perfil.": "Sign in to manage your profile.",
    "Sesión iniciada": "Signed in",
    "Sesión cerrada": "Signed out",
    "Perfil añadido": "Profile added",
    "Copiar usuario": "Copy username",
    "Elige un nombre de jugador. No necesitas cuenta de Microsoft ni conexión a internet para usar el launcher.": "Choose a player name. You don't need a Microsoft account or an internet connection to use the launcher.",
    "El nombre debe tener entre 3 y 16 caracteres. Solo letras, números y guion bajo (_).": "The name must be 3 to 16 characters. Letters, numbers and underscore (_) only.",
    "Usa entre 3 y 16 caracteres: letras, números o guion bajo.": "Use 3 to 16 characters: letters, numbers or underscore.",
    "Se borrará este perfil del launcher. Tus mundos y partidas guardadas no se tocan.": "This launcher profile will be deleted. Your worlds and saves are not touched.",
    "Algo salió mal": "Something went wrong",
    "Atención": "Warning",
    "Hecho": "Done",
    "NexyLauncher": "NexyLauncher",
    "Cerrar aviso": "Close notification",
    "Cerrar": "Close",
    "Aceptar": "OK",
    "Cancelar": "Cancel",
    "Continuar": "Continue",
    "Sí": "Yes",
    "No": "No",
    "Siguiente": "Next",
    "Anterior": "Previous",
    "Cerrar sesión": "Sign out",
    "Salir": "Exit",
    "Recargar": "Reload",

    /* ---------- Acerca de / pie ---------- */
    "Acerca de": "About",
    "Versión del launcher": "Launcher version",
    "Electron": "Electron",
    "Chromium": "Chromium",
    "© 2026 NexyLauncher": "© 2026 NexyLauncher",
    "No afiliado a Mojang Studios": "Not affiliated with Mojang Studios",
    "Últimos cambios de NexyLauncher": "Latest NexyLauncher changes",
    "Ayuda de Minecraft": "Minecraft help",
    "Minecraft.net": "Minecraft.net",
    "Formulario de feedback": "Feedback form",
    "Dudas, sugerencias y reportes de errores": "Questions, suggestions and bug reports",
    "Envía sugerencias o errores desde Google Forms": "Send suggestions or bugs via Google Forms",
    "Abrir formulario": "Open form",
    "Mensaje directo de Discord": "Discord direct message",
    "Escribe a": "Write to",
    "para dudas, sugerencias o reportes": "for questions, suggestions or reports",
    "Este enlace estará disponible próximamente.": "This link will be available soon.",
    "Próximamente": "Coming soon",
    "Tus perfiles se guardan en este equipo.": "Your profiles are stored on this PC.",
    "Los datos se guardan solo en tu equipo.": "Your data is stored only on your PC.",
    "Cuentas offline.": "Offline accounts.",
    "Cuenta offline": "Offline account",
    "Todas las cuentas son offline.": "All accounts are offline.",
    "Recuerda: usas cuentas offline": "Remember: you're using offline accounts",
    "Servidores con verificación premium pueden rechazar tu conexión. Es normal: no estás usando una cuenta de Microsoft.": "Servers with premium verification may reject your connection. That's normal: you're not using a Microsoft account.",
    "Los servidores con": "Servers with",
    "no permitirán tu entrada. Busca servidores \"cracked\" u offline, o monta uno propio. El launcher usa el nombre que elegiste como identidad.": "won't let you in. Look for \"cracked\" or offline servers, or host your own. The launcher uses the name you chose as your identity.",
    "Sin límites.": "No limits.",
    "BIENVENIDO A NEXY": "WELCOME TO NEXY",
    "Preparando tu launcher…": "Preparing your launcher…",
    "MINECRAFT · JAVA EDITION": "MINECRAFT · JAVA EDITION",
    "Tu Minecraft. Sin cuentas premium, sin complicaciones.": "Your Minecraft. No premium accounts, no hassle.",
    "Tu mundo.": "Your world.",
    "VERSIÓN 1.0": "VERSION 1.0",
    "desde tu equipo": "from your PC",
    "Versiones, recursos y librerías desde Mojang.": "Versions, assets and libraries from Mojang.",
    "Motor de ejecución de Minecraft": "Minecraft runtime",

    /* ---------- Fechas y textos sueltos ---------- */
    "hace un momento": "a moment ago",
    "nueva versión": "new version",
    "versión desconocida": "unknown version",
    "última": "latest",
    "Última versión estable de Minecraft": "Latest stable Minecraft version",
    "Esta versión": "This version",
    "Página 1": "Page 1",
    "Es-ES": "en-US",
    "es-ES": "en-US",

    /* ---------- Ampliación: textos dinámicos y segundas pasadas ---------- */
    "Abrir": "Open",
    "Lanzamiento": "Launch",
    "Juego": "Game",
    "Jugar": "Play",
    "Ámbar": "Amber",
    "Tema ámbar": "Amber theme",
    "Violeta": "Violet",
    "Tema violeta": "Violet theme",
    "Esmeralda": "Emerald",
    "Tema esmeralda": "Emerald theme",
    "Azul": "Azure",
    "Tema azul": "Azure theme",
    "Rosa": "Rose",
    "Tema rosa": "Rose theme",
    "AVISO": "NOTICE",
    "CONFIGURACIÓN": "CONFIGURATION",
    "PERFILES AISLADOS": "ISOLATED PROFILES",
    "PERSONALIZACIÓN": "CUSTOMIZATION",
    "MULTIJUGADOR": "MULTIPLAYER",
    "CONTENIDO LOCAL": "LOCAL CONTENT",
    "ASISTENTE IA": "AI ASSISTANT",
    "CONFIRMAR": "CONFIRM",
    "TU PERFIL": "YOUR PROFILE",
    "INSTANCIA ACTIVA": "ACTIVE INSTANCE",
    "NUEVA INSTANCIA": "NEW INSTANCE",
    "EDITAR INSTANCIA": "EDIT INSTANCE",
    "AJUSTES DE INSTANCIA": "INSTANCE SETTINGS",
    "DIAGNÓSTICO": "DIAGNOSTICS",
    "GALERÍA": "GALLERY",
    "ELIMINAR": "DELETE",
    "NUEVO SERVIDOR": "NEW SERVER",
    "EDITAR SERVIDOR": "EDIT SERVER",
    "Automático": "Automatic",
    "Automático (recomendado)": "Automatic (recommended)",
    "Automático (mejor Java disponible)": "Automatic (best available Java)",
    "Heredar del launcher": "Inherit from launcher",
    "No disponible": "Unavailable",
    "Sin versiones compatibles": "No compatible versions",
    "No hay coincidencias": "No matches",
    "Sin contenido": "No content",
    "Sin detalles": "No details",
    "Sin errores": "No errors",
    "Sin capturas": "No screenshots",
    "Sin resource packs": "No resource packs",
    "Sin shaders": "No shaders",
    "Sin sesión": "No session",
    "Sin API key": "No API key",
    "Sin actualizaciones": "No updates",
    "Sin mods instalados": "No mods installed",
    "Sin mods instalados.": "No mods installed.",
    "Sin descripción": "No description",
    "No detectado": "Not detected",
    "Todas desactivadas": "All disabled",
    "Crítico": "Critical",
    "Aviso": "Notice",
    "Error": "Error",
    "Error desconocido.": "Unknown error.",
    "Error al iniciar el launcher:": "Error starting the launcher:",
    "¿Seguro?": "Are you sure?",
    "¿No tienes Java?": "Don't have Java?",
    "¿Eliminar la instancia?": "Delete the instance?",
    "memoria asignada": "allocated memory",
    "Descarga automática": "Automatic download",
    "Añadiendo…": "Adding…",
    "Eligiendo carpeta…": "Choosing folder…",
    "Archivo eliminado.": "File deleted.",
    "Activar versión seleccionada": "Activate selected version",
    "Desactivar versión seleccionada": "Deactivate selected version",
    "Ajustes de la instancia guardados.": "Instance settings saved.",
    "Actualización incompleta": "Incomplete update",
    "Copiar instancia": "Copy instance",
    "Crear instancia": "Create instance",
    "Instancia": "Instance",
    "Instancia actualizada": "Instance updated",
    "Instancia actualizada.": "Instance updated.",
    "Instancia cambiada": "Instance changed",
    "Instancia duplicada": "Instance duplicated",
    "Instancia eliminada.": "Instance deleted.",
    "Instancia lista": "Instance ready",
    "Importar modpack o instancia": "Import modpack or instance",
    "Editar servidor": "Edit server",
    "Servidor actualizado.": "Server updated.",
    "Guardar cambios": "Save changes",
    "Eliminar captura": "Delete screenshot",
    "Eliminar copia": "Delete backup",
    "Eliminar mod": "Delete mod",
    "Eliminar mundo": "Delete world",
    "Eliminar perfil": "Delete profile",
    "Eliminar servidor": "Delete server",
    "Perfil activo": "Active profile",
    "Perfil y cliente presentes.": "Profile and client present.",
    "No se detectaron errores conocidos.": "No known errors detected.",
    "No se han detectado errores conocidos": "No known errors detected",
    "No se pudo actualizar la instancia": "Couldn't update the instance",
    "No se pudo cambiar el archivo": "Couldn't change the file",
    "No se pudo detectar Java:": "Couldn't detect Java:",
    "No se pudo elegir la carpeta": "Couldn't choose the folder",
    "No hay ninguna clave guardada.": "No saved key.",
    "El registro ya no está disponible": "The log is no longer available",
    "El servidor de Discord estará disponible próximamente": "The Discord server will be available soon",
    "Elige una versión de Minecraft para la instancia.": "Pick a Minecraft version for the instance.",
    "Gestiona tus archivos y descubre mods compatibles sin salir del launcher.": "Manage your files and discover compatible mods without leaving the launcher.",
    "Buscar mod instalado…": "Search installed mod…",
    "Buscar mods: sodium, jei, create…": "Search mods: sodium, jei, create…",
    "Cerrar consola": "Close console",
    "Copiar el usuario de Discord para enviar un mensaje directo": "Copy the Discord username to send a direct message",
    "Generar un nombre aleatorio": "Generate a random name",
    "Navegación principal": "Main navigation",
    "Pega tu API key de CurseForge": "Paste your CurseForge API key",
    "Ej. Steve": "e.g. Steve",
    "Pregunta lo que quieras… Por ejemplo: ¿por qué crashea mi instancia?": "Ask anything… For example: why does my instance crash?",
    "Tipo de contenido": "Content type",
    "--- Extracto del registro ---": "--- Log excerpt ---",
    "Añade tu API key de CurseForge para buscar en su catálogo. Modrinth sigue disponible sin cuenta.": "Add your CurseForge API key to search its catalogue. Modrinth is still available without an account.",
    "Añade tu API key en Ajustes → Mods e integraciones para buscar en CurseForge. Modrinth funciona sin configuración.": "Add your API key in Settings → Mods & integrations to search CurseForge. Modrinth works without setup.",
    "CurseForge necesita una API key. Añádela en Ajustes → Mods e integraciones o cambia a Modrinth.": "CurseForge needs an API key. Add it in Settings → Mods & integrations or switch to Modrinth.",
    "Descarga abierta en el navegador. Ejecuta el instalador sobre la versión actual: tus datos se conservan.": "Download opened in your browser. Run the installer over the current version: your data is kept.",
    "Has asignado casi toda la memoria del sistema. Deja margen para Windows y el resto de aplicaciones.": "You've assigned almost all system memory. Leave headroom for Windows and other apps.",
    "He tenido un crash en Minecraft. Analiza el registro, dime la causa más probable y propón un arreglo si puedes.": "I've had a Minecraft crash. Analyse the log, tell me the most likely cause and suggest a fix if you can.",
    "Marca «Heredar» para usar el ajuste global del launcher. Los cambios se aplican al lanzar esta instancia.": "Check “Inherit” to use the launcher's global setting. Changes apply when this instance launches.",
    "Mejoras de estabilidad y correcciones.": "Stability improvements and fixes.",
    "Minecraft se cerró. Abre el Asistente para decidir si la IA lee el registro.": "Minecraft closed. Open the Assistant to decide whether the AI reads the log.",
    "Ningún mod instalado tiene información de Modrinth. Instálalos desde Descubrir para poder actualizarlos.": "No installed mod has Modrinth information. Install them from Discover to update them.",
    "No se encontró ninguna instalación de Java. Puedes elegir una manualmente en Ajustes → Java.": "No Java installation was found. You can choose one manually in Settings → Java.",
    "No hay ninguna versión instalada. Elige una versión arriba y pulsa Jugar; se descargará automáticamente.": "No version is installed yet. Pick one above and press Play; it will download automatically.",
    "¿En qué te ayudo?": "What can I help you with?",
    "Puedo leer la configuración de tu launcher, revisar mods, explicarte un crash y proponer arreglos que puedes deshacer.": "I can read your launcher settings, review mods, explain a crash and suggest fixes you can undo.",
    "Revisa mis mods y dime si hay conflictos": "Review my mods and tell me about conflicts",
    "Añade tu API key en Ajustes → Asistente de IA para empezar.": "Add your API key in Settings → AI assistant to get started.",
    "No hay registros todavía": "No logs yet",
    "Inicia el juego al menos una vez para generar latest.log y los informes de crash.": "Launch the game at least once to generate latest.log and crash reports.",
    "Leyendo la ficha del mod en Modrinth…": "Reading the mod page on Modrinth…",
    "El autor no ha añadido imágenes a la galería.": "The author hasn't added any gallery images.",
    "No hay mods que coincidan. Prueba con otra búsqueda.": "No mods match. Try another search.",
    "Asigna una versión de Minecraft a esta instancia para buscar mods compatibles.": "Assign a Minecraft version to this instance to search compatible mods.",
    "Esta instancia usa Vanilla. Cambia el cargador a Fabric, Forge, NeoForge o Quilt para instalar mods.": "This instance is Vanilla. Change the loader to Fabric, Forge, NeoForge or Quilt to install mods.",
    "Instalado": "Installed",
    "Cambia de versión en la pestaña Versiones.": "Change versions in the Versions tab.",
    "Añadir carátula": "Add cover",
    "Carpeta no encontrada": "Folder not found",
    "Reintentar": "Retry",
    "Ver extracto del registro": "View log excerpt",
    "Restaurar antes del arreglo": "Restore before the fix",
    "Descargar última compatible": "Download latest compatible",
    "Editar instancia": "Edit instance",
    "Ver mundos": "View worlds",
    "Ver capturas": "View screenshots",
    "Buscando mods compatibles.": "Searching for compatible mods.",
    "o": "or",
    "Se guarda solo en este equipo. Consigue una clave gratuita en el portal de desarrolladores de CurseForge.": "Stored only on this PC. Get a free key on the CurseForge developer portal.",
    "Se recuperarán los mods y ajustes que había justo antes de que la IA tocara nada. Los cambios posteriores a ese momento también se perderán.": "Mods and settings from just before the AI changed anything will be restored. Changes made after that will also be lost.",
    "Se restaurarán el tema, la memoria, la resolución, Java y los argumentos. No se borran partidas, versiones, mods ni perfiles.": "Theme, memory, resolution, Java and arguments will be restored. Worlds, versions, mods and profiles are not deleted.",
    "(gratis y sin cuenta) o en": "(free and no account) or at",
    "(requiere una API key opcional). El launcher descarga el archivo y verifica su hash cuando está disponible. En Modrinth, las dependencias obligatorias se instalan automáticamente. Elige un cargador (Fabric, Forge, NeoForge o Quilt) en Inicio para jugar con ellos.": "(requires an optional API key). The launcher downloads the file and verifies its hash when available. In Modrinth, required dependencies are installed automatically. Pick a loader (Fabric, Forge, NeoForge or Quilt) on Home to play with them."
  };

  const PATTERNS = [
    [/^Página (\d+)$/, (m) => `Page ${m[1]}`],
    [/^Página (\d+) · (\d+) mods$/, (m) => `Page ${m[1]} · ${m[2]} mods`],
    [/^Página (\d+) de (\d+) · (.+) mods$/, (m) => `Page ${m[1]} of ${m[2]} · ${m[3]} mods`],
    [/^Buscando mods en (.+)\.$/, (m) => `Searching for mods on ${m[1]}.`],
    [/^Java (\d+)$/, (m) => `Java ${m[1]}`],
    [/^Última (.+)$/, (m) => `Latest ${m[1]}`],
    [/^de (.+) GB del sistema$/, (m) => `of ${m[1]} GB system`],
    [/^(.+) GB de RAM · (.+) GB libres$/, (m) => `${m[1]} GB RAM · ${m[2]} GB free`],
    [/^Avatar de (.+)$/, (m) => `${m[1]}'s avatar`],
    [/^Jugar Minecraft (.+) con (.+)$/, (m) => `Play Minecraft ${m[1]} with ${m[2]}`],
    [/^Jugar Minecraft (.+)$/, (m) => `Play Minecraft ${m[1]}`],
    [/^(.+) · Lanzamiento$/, (m) => `${m[1]} · Launch`],
    [/^Tema (.+)$/, (m) => `${m[1]} theme`],
    [
      /^Resultados para (.+)\. En Modrinth, las dependencias obligatorias se instalan automáticamente\.$/,
      (m) => {
        const context = m[1]
          .replace(/\btodos los cargadores\b/g, 'all loaders')
          .replace(/\btodas las versiones\b/g, 'all versions');
        return `Results for ${context}. In Modrinth, required dependencies are installed automatically.`;
      }
    ],
    [
      /^Automático: se elegirá Java (.+) \((.+)\) para esta versión\. Necesita Java (.+)\+\.$/,
      (m) => `Automatic: Java ${m[1]} (${m[2]}) will be used for this version. Requires Java ${m[3]}+.`
    ],
    [/^Java (.+) listo\. Iniciando Minecraft (.+)…$/, (m) => `Java ${m[1]} ready. Starting Minecraft ${m[2]}…`],
    [/^Java (.+) listo$/, (m) => `Java ${m[1]} ready`],
    [/^(.+) listo\. Comprobando Java…$/, (m) => `${m[1]} ready. Checking Java…`],
    [/^Buscando versiones de (.+) para Minecraft (.+)…$/, (m) => `Looking for ${m[1]} versions for Minecraft ${m[2]}…`],
    [/^Buscando versiones de (.+) para (.+)…$/, (m) => `Looking for ${m[1]} versions for ${m[2]}…`],
    [/^(.+) no tiene versiones para esta versión de Minecraft\.$/, (m) => `${m[1]} has no versions for this Minecraft version.`],
    [/^(.+) no tiene versiones para Minecraft (.+)\.$/, (m) => `${m[1]} has no versions for Minecraft ${m[2]}.`],
    [/^Elige una versión de (.+)\.$/, (m) => `Pick a ${m[1]} version.`],
    [/^Solo se detectó Java (.+)\.$/, (m) => `Only Java ${m[1]} was detected.`],
    [/^Minecraft (.+) no puede iniciarse con el Java detectado\.$/, (m) => `Minecraft ${m[1]} can't start with the detected Java.`],
    [/^No se detectó Java\. Minecraft (.+) necesita Java (.+)\. Usa Instalar para descargarlo\.$/, (m) => `Java wasn't detected. Minecraft ${m[1]} needs Java ${m[2]}. Use Install to download it.`],
    [/^Falta Java (.+) para esta versión\. Usa Instalar o Examinar para añadirlo\.$/, (m) => `Java ${m[1]} is missing for this version. Use Install or Browse to add it.`],
    [/^Java (.+) asignado a (.+)\. Esta versión necesita Java (.+)\+\.$/, (m) => `Java ${m[1]} assigned to ${m[2]}. This version needs Java ${m[3]}+.`],
    [/^Java (.+) instalado y asignado a esta versión\.$/, (m) => `Java ${m[1]} installed and assigned to this version.`],
    [/^Se encontraron (.+) instalación(?:es)? de Java\.$/, (m) => `${m[1]} Java installation${m[1] === '1' ? '' : 's'} found.`],
    [/^La API key funciona\. CurseForge tiene (.+) mods disponibles\.$/, (m) => `The API key works. CurseForge has ${m[1]} mods available.`],
    [/^La API key funciona\. Modelo: (.+)\.$/, (m) => `The API key works. Model: ${m[1]}.`],
    [/^Conexión correcta con (.+)\.$/, (m) => `Connection successful with ${m[1]}.`],
    [/^Ahora juegas como (.+)\.$/, (m) => `You're now playing as ${m[1]}.`],
    [/^Bienvenido, (.+)\. Ya puedes jugar con tu cuenta offline\.$/, (m) => `Welcome, ${m[1]}. You can now play with your offline account.`],
    [/^Has entrado como (.+)\.$/, (m) => `You're signed in as ${m[1]}.`],
    [/^Has cerrado la sesión de (.+)\. Tu perfil sigue guardado\.$/, (m) => `You signed out of ${m[1]}. Your profile is still saved.`],
    [/^Perfil (.+) activado\.$/, (m) => `Profile ${m[1]} activated.`],
    [/^Perfil (.+) eliminado\.$/, (m) => `Profile ${m[1]} deleted.`],
    [/^Instancia «(.+)» activa\.$/, (m) => `Instance “${m[1]}” active.`],
    [/^Instancia «(.+)» creada\.$/, (m) => `Instance “${m[1]}” created.`],
    [/^Dirección (.+) copiada\.$/, (m) => `Address ${m[1]} copied.`],
    [/^Usuario (.+) copiado\. Abre Discord y envía un mensaje directo\.$/, (m) => `Username ${m[1]} copied. Open Discord and send a direct message.`],
    [/^“(.+)” eliminado de tu lista\.$/, (m) => `“${m[1]}” removed from your list.`],
    [/^«(.+)» importada con (.+) archivos?\.$/, (m) => `“${m[1]}” imported with ${m[2]} file(s).`],
    [/^«(.+)» no está marcada como compatible con Minecraft (.+) · (.+)\. Instalarla podría impedir que el juego arranque\. ¿Quieres instalarla igualmente\?$/, (m) => `“${m[1]}” isn't marked as compatible with Minecraft ${m[2]} · ${m[3]}. Installing it could stop the game from starting. Install it anyway?`],
    [/^¿Eliminar “(.+)”\?$/, (m) => `Delete “${m[1]}”?`],
    [/^¿Eliminar «(.+)»\?$/, (m) => `Delete “${m[1]}”?`],
    [/^¿Eliminar a (.+)\?$/, (m) => `Delete ${m[1]}?`],
    [/^Se borrará “(.+)” de la carpeta mods\. No se puede deshacer\.$/, (m) => `“${m[1]}” will be deleted from the mods folder. This can't be undone.`],
    [/^Se borrará «(.+)» de esta instancia\. Esta acción no se puede deshacer\.$/, (m) => `“${m[1]}” will be deleted from this instance. This can't be undone.`],
    [/^Se borrará «(.+)»\. Esta acción no se puede deshacer\.$/, (m) => `“${m[1]}” will be deleted. This can't be undone.`],
    [/^Se borrará «(.+)»\.$/, (m) => `“${m[1]}” will be deleted.`],
    [/^Se extraerá «(.+)» como un mundo nuevo\. El mundo original no se toca\.$/, (m) => `“${m[1]}” will be extracted as a new world. The original world is untouched.`],
    [/^Se quitará (.+) de tu lista de servidores\. Puedes volver a añadirlo cuando quieras\.$/, (m) => `${m[1]} will be removed from your server list. You can add it again anytime.`],
    [/^Restaurado como «(.+)»\.$/, (m) => `Restored as “${m[1]}”.`],
    [/^Registros de (.+)$/, (m) => `Logs for ${m[1]}`],
    [/^Descripción: (.+)$/, (m) => `Description: ${m[1]}`],
    [/^Instancia: (.+)$/, (m) => `Instance: ${m[1]}`],
    [/^Perfil: (.+) · Cliente: (.+)$/, (m) => `Profile: ${m[1]} · Client: ${m[2]}`],
    [/^Perfil: (.+)$/, (m) => `Profile: ${m[1]}`],
    [/^Cuenta: (.+)$/, (m) => `Account: ${m[1]}`],
    [/^Carpeta de datos: (.+)$/, (m) => `Data folder: ${m[1]}`],
    [/^Carpeta del juego: (.+)$/, (m) => `Game folder: ${m[1]}`],
    [/^Versión de lanzamiento: (.+) · (.+)$/, (m) => `Launch version: ${m[1]} · ${m[2]}`],
    [/^Ajustar la RAM a (.+)[–-](.+) GB$/, (m) => `Set RAM to ${m[1]}–${m[2]} GB`],
    [/^Eliminar (.+)$/, (m) => `Delete ${m[1]}`],
    [/^(\d+) archivos? añadidos?\.$/, (m) => `${m[1]} file${m[1] === '1' ? '' : 's'} added.`],
    [/^(\d+) mods? añadidos? a la carpeta mods\.$/, (m) => `${m[1]} mod${m[1] === '1' ? '' : 's'} added to the mods folder.`],
    [/^(\d+) mods? añadidos? a la instancia\.$/, (m) => `${m[1]} mod${m[1] === '1' ? '' : 's'} added to the instance.`],
    [/^(\d+) mods? añadidos?\. (\d+) archivos? no válidos?\.$/, (m) => `${m[1]} mod${m[1] === '1' ? '' : 's'} added. ${m[2]} invalid file${m[2] === '1' ? '' : 's'}.`],
    [/^(\d+) mods? no se pudo actualizar: (.+)$/, (m) => `Couldn't update ${m[1]} mod${m[1] === '1' ? '' : 's'}: ${m[2]}`],
    [/^(\d+) actualizaciones? disponibles? de (\d+) mods comprobados\.$/, (m) => `${m[1]} update${m[1] === '1' ? '' : 's'} available from ${m[2]} mods checked.`],
    [/^Todo al día\. (\d+) mods? comprobados?\.$/, (m) => `All up to date. ${m[1]} mod${m[1] === '1' ? '' : 's'} checked.`],
    [/^NexyLauncher (.+) ya está disponible para descargar\.$/, (m) => `NexyLauncher ${m[1]} is now available to download.`],
    [/^(\d+) · \+(\d+) más$/, (m) => `${m[1]} · +${m[2]} more`],
    [/^(.+) · \+(\d+) más$/, (m) => `${m[1]} · +${m[2]} more`],
    [/^\+(\d+) más$/, (m) => `+${m[1]} more`],
    [/^(\d+) archivos? no se pudieron descargar\. Usa Verificar y Reparar en la instancia\.$/, (m) => `${m[1]} file${m[1] === '1' ? '' : 's'} couldn't be downloaded. Use Verify and Repair on the instance.`],
    [/^(\d+) archivos? · (\d+) activos? · (.+)$/, (m) => `${m[1]} file${m[1] === '1' ? '' : 's'} · ${m[2]} active · ${m[3]}`],
    [/^Ningún mod coincide con “(.+)” para los filtros elegidos\. Prueba con otra versión o cargador\.$/, (m) => `No mod matches “${m[1]}” for the selected filters. Try another version or loader.`],
    [/^Ningún mod coincide con “(.+)”\.$/, (m) => `No mod matches “${m[1]}”.`]
  ];

  const ATTRS = ['title', 'placeholder', 'aria-label', 'data-tip', 'alt'];
  let current = 'es';
  let observer = null;
  const textOriginals = new Map();
  const attrOriginals = new Map();

  function translate(value) {
    if (typeof value !== 'string') return null;
    const source = value.trim();
    if (!source || source.length > 400) return null;
    if (Object.prototype.hasOwnProperty.call(EN, source)) return EN[source];
    for (const [regex, build] of PATTERNS) {
      const match = regex.exec(source);
      if (match) return build(match);
    }
    return null;
  }

  function translateTextNode(node) {
    if (current !== 'en' || !node || node.nodeType !== 3) return;
    const value = node.nodeValue;
    const translated = translate(value);
    if (!translated) return;
    const leading = value.match(/^\s*/)[0];
    const trailing = value.match(/\s*$/)[0];
    const next = `${leading}${translated}${trailing}`;
    if (node.nodeValue === next) return;
    textOriginals.set(node, value);
    node.nodeValue = next;
  }

  function translateAttrs(element) {
    if (current !== 'en' || !element || element.nodeType !== 1) return;
    for (const attr of ATTRS) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const translated = translate(value);
      if (!translated || translated === value) continue;
      let store = attrOriginals.get(element);
      if (!store) {
        store = new Map();
        attrOriginals.set(element, store);
      }
      if (!store.has(attr)) store.set(attr, value);
      element.setAttribute(attr, translated);
    }
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType === 1) translateAttrs(root);
    if (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === 3) translateTextNode(node);
      else translateAttrs(node);
      node = walker.nextNode();
    }
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      if (current !== 'en') return;
      for (const mutation of mutations) {
        if (mutation.type === 'characterData') translateTextNode(mutation.target);
        else if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) walk(node);
        } else if (mutation.type === 'attributes') translateAttrs(mutation.target);
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
  }

  function restore() {
    for (const [node, value] of textOriginals) {
      if (node.isConnected) node.nodeValue = value;
    }
    textOriginals.clear();
    for (const [element, store] of attrOriginals) {
      if (!element.isConnected) continue;
      for (const [attr, value] of store) element.setAttribute(attr, value);
    }
    attrOriginals.clear();
  }

  function paintButtons() {
    document.querySelectorAll('[data-lang]').forEach((button) => {
      const active = button.dataset.lang === current;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function apply(lang) {
    const next = lang === 'en' ? 'en' : 'es';
    const changed = next !== current;
    current = next;
    document.documentElement.lang = next;
    if (changed) {
      if (next === 'en') {
        walk(document.body);
        startObserver();
      } else {
        restore();
      }
    }
    paintButtons();
  }

  function init() {
    const initial = state.settings?.language === 'en' ? 'en' : 'es';
    document.querySelectorAll('[data-lang]').forEach((button) => {
      button.addEventListener('click', () => setLanguage(button.dataset.lang));
    });
    current = initial === 'en' ? 'es' : 'en';
    apply(initial);
  }

  function setLanguage(lang) {
    const next = lang === 'en' ? 'en' : 'es';
    apply(next);
    if (state.settings) state.settings.language = next;
    App.api.settings.save({ language: next }).catch(() => {});
  }

  /* Para usar desde el resto de módulos: t('Texto en español'). */
  function t(text) {
    if (current !== 'en') return text;
    return translate(text) || text;
  }

  App.i18n = { init, apply, setLanguage, t, get language() { return current; } };
})();
