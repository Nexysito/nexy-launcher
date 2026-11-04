# NexyLauncher 1.0

Launcher de escritorio para **Minecraft: Java Edition** centrado en **cuentas offline / no premium**. Interfaz oscura en español, gestión de versiones, cargadores de mods, mods, servidores y ajustes de lanzamiento, construido con **Electron** y **minecraft-launcher-core**.

> Proyecto independiente. No está afiliado a Mojang Studios ni a Microsoft. Minecraft es una marca de Mojang Studios.

---

## Características

- **Cuentas offline**: crea varios nombres de jugador, cámbialos y elimínalos sin cuenta de Microsoft.
- **Instancias aisladas**: cada instancia tiene asignada su versión de Minecraft y su cargador, además de su propia carpeta con versiones, mods, mundos, recursos y ajustes. Cambia entre ellas desde **Instancias** sin mezclar archivos; la instancia activa se muestra en Inicio.
- **Vista de detalle de instancia**: al abrir una instancia verás su carátula, nombre, descripción y la lista de mods. Desde ahí puedes jugar, buscar e instalar mods de Modrinth compatibles, activarlos o desactivarlos renombrándolos a `.jar.disabled`, eliminarlos, abrir los ajustes, la carpeta o `latest.log`, analizar el último crash, verificar, exportar, duplicar o eliminar la instancia.
- **Importar y exportar modpacks**: importa `.mrpack` de Modrinth, ZIP de CurseForge y exportaciones de NexyLauncher con su versión y cargador, y exporta cualquier instancia como `.mrpack` o ZIP con mods, configuración y recursos (y mundos si lo eliges).
- **Ajustes por instancia**: memoria RAM, resolución, Java, argumentos JVM y del juego y minimizar al lanzar propios de cada instancia, heredando los globales cuando no se configuran.
- **Verificar y reparar**: comprueba la versión base, el cargador, las librerías y los recursos de una instancia y descarga lo que falte con un solo botón.
- **UUID offline correcto**: se genera el UUID v3 de `OfflinePlayer:<nombre>` para que tus mundos y avances mantengan la misma identidad.
- **Catálogo de versiones**: el selector de **Inicio** incluye el catálogo oficial de Mojang, con snapshots opcionales; al pulsar **Jugar** se descarga e instala automáticamente lo que falte.
- **Cargadores integrados**: elige **Vanilla**, **Fabric**, **Forge**, **NeoForge** o **Quilt** y su versión. Si faltan la versión base o el cargador, Nexy los instala automáticamente al pulsar **Jugar**.
- **Versiones modificadas**: detecta instalaciones existentes de Forge, NeoForge, Fabric y Quilt, las etiqueta con su cargador y versión base y permite lanzarlas directamente desde la lista de versiones instaladas.
- **Mods integrados**: busca e instala mods desde **Modrinth** (sin cuenta) o **CurseForge** (con API key opcional), filtrando por versión de Minecraft y cargador. Cada instancia tiene su propio buscador de Modrinth que instala la última versión compatible con un clic y abre una ficha con descripción, galería y versiones. En Modrinth, las dependencias obligatorias se instalan automáticamente.
- **Lanzamiento guiado**: selecciona versión, cargador, memoria RAM, resolución, Java y argumentos; el launcher descarga lo que falte, elige el Java que pide cada versión y muestra progreso, descargas y consola en vivo.
- **Conexión rápida a servidores**: guarda servidores y entra directamente. En 1.20+ usa `--quickPlayMultiplayer`; en versiones anteriores usa `--server` / `--port`.
- **Gestor de mods**: arrastra archivos `.jar` o selecciónalos, actívalos/desactívalos renombrándolos a `.jar.disabled` y elimínalos.
- **Actualizador de mods**: en **Mods → Instalados**, pulsa **Buscar actualizaciones** para consultar Modrinth con la versión de Minecraft y el cargador de la instancia. Muestra la versión instalada, la nueva, el canal (estable/beta/alpha), el changelog y permite actualizar uno o todos los seleccionados conservando su estado activo o desactivado.
- **Contenido local**: nueva página **Contenido** con pestañas para **Mundos**, **Resource packs**, **Shaders** y **Capturas**. Permite crear y restaurar copias de seguridad de mundos en ZIP, duplicarlos, abrirlos o eliminarlos; añadir, activar/desactivar y borrar resource packs y shaders; y ver una galería de capturas con miniaturas, visor ampliado, apertura y borrado.
- **Estado de servidores**: cada servidor guardado muestra si está en línea, su latencia, jugadores conectados/máximos, versión y MOTD mediante Server List Ping (TCP + VarInt), con soporte de registros SRV y un botón para comprobar todos de nuevo.
- **Análisis de crashes**: el menú **⋯** del detalle analiza `latest.log` y el informe más reciente de `crash-reports`, detecta causas habituales (memoria, dependencias, mixins, mods incompatibles, Java, gráficos, permisos, red o mundos dañados) y propone soluciones. El informe se puede copiar al portapapeles.
- **Asistente de IA**: página **Asistente** con chat que conoce la instancia, los mods, las versiones y los ajustes del launcher. Usa tu propia API key (OpenAI o cualquier API compatible), lee el crash solo si lo autorizas, propone arreglos (desactivar mods, cambiar RAM, argumentos JVM, Java o reparar la instancia) y permite restaurar el estado anterior con un botón.
- **Ajustes completos**: memoria mínima/máxima, resolución y pantalla completa, rutas de Java por versión, argumentos JVM y del juego, minimizar al lanzar, inicio de sesión automático, snapshots, proveedor de mods y cinco temas de color. Los ajustes de lanzamiento pueden sobrescribirse por instancia.
- **Comunidad y feedback**: accesos al formulario de Google y al contacto por mensaje directo de Discord (`zombigamer55`) desde **Inicio** y **Ajustes**, además de **Copiar diagnóstico** (versión, SO, Java, instancia y mods) y **Abrir logs**. El servidor de Discord se muestra como **Próximamente**.
- **Consola y registros**: consola integrada con niveles, copia al portapapeles y registro de cada lanzamiento en `logs/nexy-launcher-last.log`.
- **Persistencia portable**: cuentas, servidores, ajustes, estado de ventana y caché del manifiesto se guardan en `data\` junto al launcher, no en `%APPDATA%`.
- **Interfaz cuidada**: ventana sin marco, barra lateral, pantalla de bienvenida, avatares pixel generados, modales y notificaciones (sin `alert()`), adaptada a ventanas de 1040×680 en adelante.
- **Seguridad**: `contextIsolation` activo, `nodeIntegration` desactivado, puente `preload` acotado, CSP, validación de IPC, rutas y entradas, y bloqueo de navegación externa no permitida.

---

## Requisitos

- **Windows 10/11** (probado). Electron también permite Linux y macOS, aunque el launcher se ha validado en Windows.
- **Node.js 20 o superior** y npm (probado con Node 24).
- **Java** para ejecutar Minecraft y los instaladores de cargadores. Nexy lee el requisito real de cada versión (`javaVersion.majorVersion` en su JSON) y elige un Java compatible; no fuerza siempre Java 21:
  - Minecraft 1.16.5 o anterior: Java 8 (solo Java 8).
  - Minecraft 1.17 – 1.20.4: Java 17.
  - Minecraft 1.20.5 – 1.21.x: Java 21.
  - Versiones recientes como 26.x: Java 25 o superior.
- Conexión a internet la primera vez que se descarga una versión, un cargador, librerías o recursos.
- Una copia legítima de Minecraft: Java Edition. Este launcher no incluye ni distribuye el juego.
- Para **CurseForge**, una API key gratuita del portal de desarrolladores. **Modrinth no necesita cuenta ni clave**.

El launcher detecta Java en `JAVA_HOME`, en el `PATH` y en las ubicaciones habituales de Oracle, Temurin, Adoptium, Microsoft y el runtime de Mojang. También puedes elegir el ejecutable manualmente en **Ajustes → Java**. Si falta el Java que pide una versión, el aviso de **Jugar** permite instalarlo: Nexy descarga un JRE de Adoptium y te pregunta en qué carpeta instalarlo.

---

## Puesta en marcha

```bash
# Instalar dependencias
npm install

# Abrir el launcher
npm start

# Abrir con herramientas de desarrollo
npm run dev

# Comprobar la sintaxis de todos los archivos JavaScript
npm run check
```

Consulta la sección de compilación más abajo para generar el instalador MSI con Electron Builder.

---

## Uso rápido

1. Escribe un nombre de jugador (3–16 caracteres: letras, números o `_`) y pulsa **Entrar al launcher**.
2. En **Inicio**, elige una versión base de Minecraft y, si quieres mods, un cargador y su versión. Pulsa **JUGAR**: si falta algo, Nexy descargará la versión base y el cargador automáticamente.
3. Para separar juegos, crea una instancia en **Instancias → Nueva instancia**. Cada una tiene asignada su propia versión de Minecraft y su cargador (Vanilla, Fabric, Forge, NeoForge o Quilt), además de su carpeta de mods, mundos y ajustes. Pulsa una tarjeta para abrir su detalle, donde puedes añadir carátula y descripción, pulsar **Buscar mods** para instalar mods de Modrinth, gestionar los instalados, jugar o abrir sus ajustes. La instancia activa aparece en la tarjeta de Inicio.
4. Para traer un modpack, pulsa **Instancias → Importar** y elige un `.mrpack` de Modrinth, un ZIP de CurseForge o una exportación de NexyLauncher. Nexy crea la instancia, aplica la versión y el cargador y descarga los mods.
5. Para jugar una instalación modificada que ya existe, usa el botón de reproducción de **Listo para jugar** en Inicio. El selector de Inicio muestra solo versiones base para evitar duplicados.
6. Para entrar a un servidor, guárdalo en **Servidores** y usa **Jugar en el servidor**, o selecciónalo en **Juego rápido** desde Inicio.
7. En el detalle de una instancia, pulsa **Buscar mods** para abrir su buscador de Modrinth: los resultados ya están filtrados por la versión de Minecraft y el cargador de la instancia. Pulsa **Descargar** para instalar la última versión compatible o abre la ficha del mod para ver **Descripción**, **Galería** y **Versiones**. En **Mods → Descubrir** sigue disponible el buscador global con Modrinth y CurseForge, y en **Instalados** puedes activar, desactivar o eliminar archivos y buscar actualizaciones.
8. Abre **Contenido** para gestionar los mundos (con copias de seguridad), resource packs, shaders y capturas de la instancia activa. Las copias se guardan en `<carpeta del juego>/.nexy/backups/worlds` y al restaurarlas se crea un mundo nuevo para no sobrescribir el original.
9. En **Servidores**, pulsa **Comprobar estado** para ver ping, jugadores, versión y MOTD de cada servidor guardado.
10. Ajusta RAM, resolución, Java, argumentos, proveedor de mods y API key en **Ajustes**. Para dar valores propios a una instancia, abre su detalle y pulsa el engranaje.
11. Si algo no arranca, abre el detalle de la instancia y usa **⋯ → Analizar crash** para revisar la causa probable, o **⋯ → Verificar y reparar** para descargar lo que falte.

---

## Dónde se guardan los datos

### Datos del launcher

En la carpeta donde está instalado el launcher: `<carpeta del launcher>\data\` (en desarrollo, `data\` dentro del proyecto). **No se usa `%APPDATA%`.**

Si esa carpeta no permite escritura (por ejemplo, dentro de `Program Files`), Nexy usa la carpeta de datos predeterminada de Electron como respaldo. Para mantenerlo totalmente portable, coloca el launcher en una carpeta con permisos de escritura.

Si ya usabas una versión anterior, sus datos siguen en `%APPDATA%\NexyLauncher`. No se mueven automáticamente: copia a `data\` los archivos o instancias que quieras conservar, o elimina la carpeta antigua para recuperar el espacio.

| Archivo | Contenido |
| --- | --- |
| `settings.json` | Ajustes, tema, memoria, resolución, versión y cargador de la instancia activa, proveedor de mods, lista de instancias con su versión/cargador asignados, su carpeta y sus ajustes propios, Java (`javaPath` y `javaPaths` por versión mayor), API key de CurseForge y configuración del asistente de IA (`aiApiKey`, `aiBaseUrl`, `aiModel`, `aiAutoReadCrash`) |
| `accounts.json` | Cuentas offline guardadas |
| `servers.json` | Servidores guardados |
| `window-state.json` | Tamaño, posición y estado maximizado de la ventana |
| `instances/` | Carpetas de las instancias creadas por el launcher |
| `<instancia>/.nexy/mods.json` | Metadatos de los mods instalados desde Modrinth (proyecto, versión y archivo) para marcarlos como **Instalado** al volver al buscador |
| `<instancia>/.nexy/ai-backups/` | Copias previas a cada arreglo de la IA (mods, índice y ajustes sin claves); se conservan las 12 más recientes |
| `cache/version_manifest.json` | Caché del manifiesto de versiones de Mojang |
| `cache/launch/` | JSON combinados temporales para lanzar versiones modificadas |

Puedes cambiar el directorio de datos con la variable de entorno `NEXY_USER_DATA` (útil para pruebas o para guardar los datos en otra unidad):

```powershell
$env:NEXY_USER_DATA = "D:\NexyLauncherData"
npm start
```

La **API key de CurseForge y la del asistente se guardan localmente** en `settings.json`. Ninguna se envía a servidores de Nexy: la de CurseForge solo se usa como cabecera `x-api-key` en las peticiones directas a su API, y la del asistente solo se envía al proveedor de IA configurado. El renderer nunca recibe las claves (solo sabe si están configuradas). El archivo no está cifrado, así que protege tu cuenta de Windows y no compartas ese archivo.

### Instancias y carpeta del juego

Cada instancia es una raíz de Minecraft independiente. Por defecto las nuevas se crean en `<carpeta del launcher>\data\instances\<nombre>\`, pero puedes elegir cualquier carpeta al crearlas.

La primera vez que se abre esta versión, los ajustes existentes se migran a una instancia llamada **Principal**. La carpeta de juego predeterminada es `<carpeta del launcher>\data\.minecraft`.

Desde **Instancias** puedes:

- **Abrir una instancia** pulsando su tarjeta. Se activa y se muestra la vista de detalle con su carátula, nombre, descripción, versión, cargador, lista de mods y el botón **Buscar mods**. El botón **Instancias** vuelve a la lista.
- **Crear** una instancia con nombre, versión de Minecraft, cargador, versión del cargador y carpeta propios.
- **Importar** un modpack o una instancia desde `.mrpack`, ZIP de CurseForge o exportación de NexyLauncher.
- **Editar** el nombre, la descripción, la versión o el cargador sin mover archivos. La descripción es opcional (máximo 500 caracteres) y aparece en la tarjeta.
- **Cambiar la carátula** pulsando la imagen del detalle. La imagen se recorta a 16:9, se reduce a un máximo de 800×450 y se guarda dentro de la instancia como data URL validada.
- **Gestionar los mods** desde el detalle: **Buscar mods** abre un buscador de Modrinth propio de la instancia, ya filtrado por su versión de Minecraft y su cargador. **Descargar** instala la última versión compatible con sus dependencias obligatorias; al pulsar el nombre del mod se abre su ficha con **Descripción**, **Galería** y **Versiones**, donde puedes descargar una versión concreta, filtrar por canal y ver o instalar versiones no compatibles con confirmación. Los mods ya instalados se muestran como **Instalado**, también los que llegan como dependencia. En el menú **⋯ → Añadir mod desde archivo** puedes elegir `.jar` de tu equipo. Desde el detalle también puedes activarlos o desactivarlos (renombrado `.jar` ↔ `.jar.disabled`) y eliminarlos con confirmación.
- **Jugar** desde la tarjeta o desde el detalle: activa la instancia y lanza directamente la versión y el cargador asignados.
- **Activar** otra instancia; Inicio y Mods pasan a usar su carpeta y su asignación.
- **Ajustes** (engranaje) abre la configuración propia de la instancia: memoria, resolución, Java, argumentos y minimizar al lanzar. Cada valor puede heredar el ajuste global.
- **Menú ⋯** del detalle: abrir la carpeta de la instancia, abrir `latest.log`, analizar el último crash, añadir un mod desde archivo, editar versión y cargador, editar nombre y descripción, verificar y reparar, exportar, duplicar, quitar la carátula o eliminar la instancia.
- **Verificar** revisa la versión base, el cargador, las librerías y los recursos del juego, y **Reparar** descarga lo que falte.
- **Exportar** genera un `.mrpack` o un ZIP con los mods, configuraciones, recursos y, opcionalmente, los mundos.
- **Duplicar** mods, ajustes, recursos y, opcionalmente, mundos. Las versiones no se copian: se descargan de nuevo al jugar.
- **Eliminar** la instancia. Al eliminarla, los archivos se conservan salvo que marques la casilla de borrado; solo se permite borrar carpetas creadas por el launcher.

También puedes cambiar la carpeta de la instancia activa en **Ajustes → Carpeta del juego**. Ese cambio no mueve los archivos existentes.

Dentro de cada instancia encontrarás:

```text
instances/<nombre>/
├─ versions/     versiones instaladas (JSON + jar)
│  └─ <id>/nexy-loader.json   marcador de cargador instalado por Nexy
├─ mods/         mods .jar y .jar.disabled
├─ saves/        mundos
├─ resourcepacks/
├─ shaderpacks/
├─ screenshots/  capturas de Minecraft
├─ crash-reports/ informes de crash
├─ assets/       recursos descargados de Mojang
├─ libraries/    librerías
├─ logs/         latest.log y nexy-launcher-last.log
├─ .nexy/backups/worlds/  copias de seguridad de mundos en ZIP
└─ .nexy-instance.json        marcador de instancia creada por Nexy
```

La carpeta `mods` pertenece a la instancia activa. Para usar mods incompatibles entre sí, crea instancias separadas en lugar de mezclarlos.

### Importar modpacks

**Instancias → Importar** acepta:

| Formato | Contenido | Notas |
| --- | --- | --- |
| `.mrpack` de Modrinth | `modrinth.index.json`, `overrides/` y archivos descargables | No requiere cuenta. Se aplican las dependencias de Minecraft y del cargador. |
| ZIP de CurseForge | `manifest.json` y `overrides/` | Los mods se descargan de la API de CurseForge y necesitan una API key configurada. |
| ZIP de NexyLauncher | `nexy-pack.json` y `overrides/` | Conserva la versión, el cargador, la versión del cargador y la descripción de la exportación. |

Durante la importación Nexy crea una instancia nueva con un nombre libre, extrae los overrides con validación de rutas y tamaños, descarga los mods que falten y la deja activa. Si algún archivo no se puede descargar, la instancia se crea igualmente y se avisa; después puedes usar **Verificar → Reparar**.

### Exportar una instancia

Desde el detalle de una instancia, abre el menú **⋯ → Exportar modpack** y elige:

- **`.mrpack`**: formato compatible con Modrinth y otros launchers. El contenido local se guarda en `overrides/` y las dependencias de Minecraft y del cargador se escriben en `modrinth.index.json`.
- **`.zip`**: copia de NexyLauncher con `nexy-pack.json` y el contenido en `overrides/`. Se puede volver a importar con **Importar**.

Se incluyen mods, `config`, `defaultconfigs`, `resourcepacks`, `shaderpacks`, `scripts`, `kubejs` y los archivos `options.txt`, `optionsof.txt`, `servers.dat` y `usercache.json`. Los mundos se incluyen solo si marcas **Incluir también los mundos guardados**. Las versiones, librerías y assets no se copian: se descargan de nuevo al jugar.

### Ajustes por instancia

Cada instancia puede sobrescribir los ajustes globales de lanzamiento:

- **Memoria RAM** mínima y máxima.
- **Resolución** y pantalla completa.
- **Java**: heredar, automático o un ejecutable concreto.
- **Argumentos JVM** y **argumentos del juego**.
- **Minimizar al lanzar**.

En la ventana de ajustes, la casilla **Heredar** usa el valor global del launcher. Un valor propio vacío (por ejemplo, argumentos vacíos) sobrescribe el global con una cadena vacía. Los cambios se guardan en la entrada de la instancia dentro de `settings.json` y se aplican en el siguiente lanzamiento.

### Comunidad y feedback

En **Inicio → Comunidad** y **Ajustes → Comunidad y feedback** hay botones para abrir el formulario de Google, copiar el usuario de Discord (`zombigamer55`) para enviar un mensaje directo, copiar el diagnóstico técnico y abrir la carpeta de logs. El servidor de Discord de la comunidad aparece como **Próximamente** y todavía no abre ningún enlace.

El formulario y el contacto se configuran al inicio de `renderer.js`:

```js
const FEEDBACK_LINKS = {
  form: 'https://forms.gle/P9tj3YZHLfMRQH5j8'
};
const DISCORD_CONTACT = 'zombigamer55';
```

El diagnóstico incluye versión, Electron/Chromium, sistema, CPU, RAM, Java, cuenta, instancia, Minecraft, cargador, número de mods y rutas útiles.

### Verificar y reparar

**Verificar** analiza la instancia sin necesidad de activarla ni de jugar:

- Perfil y cliente de la versión base.
- Perfil e instalación del cargador y su versión.
- Librerías de Minecraft y del cargador que falten.
- Índice de recursos y objetos de assets ausentes.

**Reparar** descarga el perfil y el cliente que falten, instala el cargador si es necesario y recupera librerías y assets con verificación de hash cuando está disponible. Las librerías de otros sistemas operativos o arquitecturas se ignoran. Al terminar se vuelve a verificar y se muestra el resultado.

---

## Cargadores: Vanilla, Fabric, Forge, NeoForge y Quilt

En **Inicio** se elige una **versión base** de Minecraft y, por separado, un **cargador** y su **versión**. El selector de versión base solo muestra versiones vanilla; las versiones modificadas ya instaladas aparecen en **Listo para jugar**.

| Cargador | Cómo lo instala Nexy | Identificador de la versión instalada |
| --- | --- | --- |
| Vanilla | Descarga el perfil y el cliente oficial de Mojang | `<versión>` |
| Fabric | Perfil oficial de Fabric Meta y librerías de Fabric Maven | `fabric-loader-<loader>-<mc>` |
| Quilt | Perfil oficial de Quilt Meta y librerías de Quilt Maven | `quilt-loader-<loader>-<mc>` |
| Forge | Instalador oficial de Forge ejecutado con el Java adecuado | `<mc>-forge-<forge>` |
| NeoForge | Instalador oficial de NeoForge ejecutado con el Java adecuado | `neoforge-<versión>`; en 1.20.1, `<mc>-forge-<versión>` |

Al pulsar **Jugar**:

1. Nexy comprueba si la versión base está instalada. Si no, la descarga desde Mojang.
2. Comprueba si el cargador elegido ya existe. Si no, lo instala con su método oficial.
3. Guarda un marcador `nexy-loader.json` en la carpeta de la versión con el cargador, su versión y la versión base. Esto permite etiquetar correctamente NeoForge 1.20.1, que se instala con un identificador de Forge.
4. Combina los JSON de la versión base y del cargador, resuelve librerías y argumentos, elige el Java adecuado y lanza el juego.

Los instaladores de **Forge** y **NeoForge** pueden tardar varios minutos y necesitan Java. Su salida aparece en la consola y en el registro del lanzamiento. Las librerías de **Fabric** y **Quilt** se descargan con verificación SHA-1 cuando el perfil la proporciona; si el host oficial de Fabric Maven no responde, se prueban espejos compatibles.

También puedes seguir usando instalaciones modificadas creadas con los instaladores oficiales. Nexy las detecta por herencia de versiones y las lanza sin reinstalarlas.

---

## Mods e integraciones

La pestaña **Mods → Descubrir** permite buscar en dos proveedores:

- **Modrinth**: API pública, sin cuenta ni API key. Es el proveedor predeterminado.
- **CurseForge**: requiere una API key personal. Se configura en **Ajustes → Mods e integraciones** y se puede validar con **Probar**. Consigue una clave gratuita en el portal de desarrolladores de CurseForge.

Filtros disponibles:

- **Versión de Minecraft**: limita los resultados a una versión concreta.
- **Cargador**: Fabric, Forge, NeoForge, Quilt o todos.
- Búsqueda por nombre y paginación de resultados.

Al abrir **Ver versiones** se muestran las versiones compatibles con esos filtros. Al instalar:

- El archivo se descarga en la carpeta `mods` de la instancia activa.
- En **Modrinth** se verifica el hash SHA-512/SHA-1 cuando está disponible, se evitan duplicados y se instalan automáticamente las dependencias obligatorias (hasta dos niveles).
- En **CurseForge** se descarga el archivo elegido y se respeta la disponibilidad indicada por la API. Revisa las dependencias que indique el autor del mod; la instalación automática de dependencias está limitada a Modrinth.
- Los mods deben coincidir con la versión de Minecraft y el cargador. Un mod de Fabric no funciona en Forge y viceversa.
- Los archivos se pueden desactivar renombrándolos a `.jar.disabled`; el juego no los cargará.

### Buscador de mods por instancia

El detalle de cada instancia incluye **Buscar mods**, un buscador de Modrinth independiente del apartado global **Mods**:

- No aparece en la barra lateral: vive dentro de la instancia y el botón superior vuelve a su detalle.
- Los resultados se filtran automáticamente por la versión de Minecraft y el cargador de la instancia; no hay selector de versión.
- **Descargar** instala la última versión compatible y sus dependencias obligatorias. Si la instancia es Vanilla o no tiene versión, se muestra un aviso y la descarga queda desactivada.
- Los mods ya instalados se marcan como **Instalado** al volver a abrir el buscador. El estado se conserva en `<instancia>/.nexy/mods.json` y, si no hay metadatos, se reconoce por el nombre del archivo.
- Al pulsar el mod se abre su ficha con **Descripción** (Markdown del autor), **Galería** (con visor ampliado) y **Versiones**. **Ver en Modrinth** abre la página oficial en el navegador.
- La pestaña **Versiones** permite descargar cualquier versión concreta, filtrar por canal (`release`, `beta`, `alpha`) y desactivar **Solo compatibles** para ver el resto. Las versiones incompatibles se señalan con un icono de aviso y piden confirmación antes de instalarse.
- Tras instalar un mod se refresca la lista completa, incluidas las dependencias, para que sus botones también pasen a **Instalado**.
- Si hay varias versiones del mismo mod instaladas, se agrupan en una sola fila con un desplegable para elegir la activa. El resto se renombra automáticamente a `.jar.disabled`, y al volver a abrir la instancia se desactivan los duplicados que hayan quedado activos.

Respeta las licencias y condiciones de cada autor al descargar y redistribuir mods. Nexy solo descarga archivos desde las APIs y CDN oficiales de los proveedores.

### Actualizador de mods

En **Mods → Instalados** hay un panel de **Actualizaciones**:

- **Buscar actualizaciones** consulta Modrinth para cada mod instalado desde el launcher, usando la versión de Minecraft y el cargador de la instancia activa.
- Cada fila muestra el nombre, la versión instalada, la nueva, el canal y el changelog del autor cuando está disponible.
- Puedes actualizar un mod concreto o marcar varios y pulsar **Actualizar seleccionados**.
- La actualización descarga el nuevo `.jar`, verifica su hash, elimina el archivo anterior y conserva el estado activo/desactivado. Los mods añadidos manualmente sin metadatos de Modrinth no se pueden comprobar.

### Contenido local: mundos, packs, shaders y capturas

La página **Contenido** trabaja siempre sobre la instancia activa:

- **Mundos**: lista los directorios de `saves` con su tamaño y fecha. Cada mundo se puede duplicar, abrir en el explorador, eliminar o guardar como copia ZIP en `.nexy/backups/worlds`. Las copias se restauran como un mundo nuevo con el sufijo `(restaurado)`, validando las rutas internas del ZIP para evitar travesías.
- **Resource packs** y **Shaders**: añade archivos `.zip` o `.jar`, actívalos o desactívalos renombrando a `.disabled`, elimínalos o abre la carpeta correspondiente. No se valida el contenido interno del pack; Minecraft mostrará si es incompatible.
- **Capturas**: galería de `screenshots` con miniaturas JPEG generadas localmente. Al pulsar una captura se abre un visor ampliado; también se puede abrir el archivo original o eliminarlo. Se listan como máximo las 80 capturas más recientes.

### Estado de servidores

La lista de **Servidores** hace un Server List Ping a cada dirección:

- Muestra si está en línea, latencia, jugadores conectados/máximos, versión y MOTD.
- Usa `dns.resolveSrv` para `_minecraft._tcp.<host>` cuando no se indica un puerto y la dirección no es una IP.
- Si el servidor está caído, rechaza la conexión o tarda más de cinco segundos, se muestra el motivo y se mantiene la opción de jugar igualmente.
- **Comprobar estado** vuelve a consultar todos los servidores.

### Análisis de crashes

Desde **⋯ → Analizar crash** en el detalle de una instancia:

- Lee el final de `logs/latest.log` y el informe más reciente de `crash-reports`.
- Detecta patrones habituales: memoria insuficiente, Java incompatible, dependencias sin resolver, mods duplicados, conflictos de Mixin, mods compilados para otra versión, problemas gráficos, permisos, red, JAR dañados, argumentos JVM inválidos y mundos corruptos.
- Muestra la descripción del crash, los mods sospechosos, las secciones de mods del informe, una línea representativa y una solución sugerida para cada problema.
- **Copiar informe** genera un texto con el diagnóstico para pegarlo en Discord o en el formulario de feedback; **Abrir latest.log** abre el registro completo.

### Asistente de IA

La página **Asistente** añade un chat conectado a un proveedor compatible con la API de OpenAI. No incluye ninguna clave: cada usuario usa la suya.

**Configuración** (Ajustes → Asistente de IA):

- **API key**: se guarda en `settings.json`, pero el renderer nunca la recibe; solo se expone `aiApiKeySet`. El proceso principal la envía directamente al proveedor elegido.
- **URL base** y **modelo**: por defecto `https://api.openai.com/v1` y `gpt-4o-mini`. Sirve también para OpenRouter, Groq, Ollama u otros servicios con `/chat/completions`. Por seguridad solo se aceptan `https://` (o `http://` en `localhost`).
- **Probar**: envía una petición mínima para comprobar que la clave y el modelo funcionan.
- **Borrar clave**: elimina la API key de este equipo.

**Contexto del launcher**:

- Cada mensaje puede incluir un resumen JSON con la instancia activa, todas las instancias, mods (archivo, estado, versión), versiones locales, mundos, servidores y ajustes. El interruptor del compositor permite desactivarlo.
- La IA responde en español y devuelve un JSON estricto `{reply, actions}`; si el proveedor envuelve el JSON en Markdown, se tolera igualmente.

**Crashes con consentimiento**:

- Si Minecraft llegó a iniciarse y se cierra con un código distinto de 0, el launcher guarda `latest.log` y el informe de `crash-reports` en memoria y muestra una tarjeta de crash en el chat y un aviso rojo en el rail.
- El renderer solo recibe metadatos y un extracto; el registro completo permanece en el proceso principal.
- La IA **no** lee el registro hasta que pulsas **Sí, que la IA lo lea**. Si pulsas **Ignorar**, no se envía nada y no se gastan tokens. La opción **Leer crashes automáticamente** omite la pregunta.

**Arreglos automáticos y restauración**:

- Acciones permitidas: `disable_mod`, `enable_mod`, `remove_mod`, `set_memory`, `set_jvm_args`, `set_java_path` y `repair_instance`. Cualquier otra acción se descarta.
- Antes de aplicar nada se crea una copia en `<gameRoot>/.nexy/ai-backups/<id>` con los mods, `mods.json`, un `settings.json` saneado (sin claves) y `meta.json`. Se conservan las 12 copias más recientes.
- Cada tarjeta de arreglo muestra los cambios propuestos; al aplicarlos se listan los que funcionaron y los que fallaron.
- **Restaurar antes del arreglo** recupera los mods y los ajustes previos. Se mantienen la cuenta activa, la instancia activa y las API keys actuales. **Deshacer arreglo** en la cabecera restaura la copia más reciente.
- No se pueden aplicar arreglos ni restaurar mientras Minecraft está en ejecución.

---

## Notas sobre Java

El requisito de Java se lee del propio JSON de la versión (`javaVersion.majorVersion`), siguiendo `inheritsFrom` cuando el perfil es un cargador. Después se elige la instalación más adecuada:

- Se prefiere la coincidencia exacta de versión mayor. Si el requisito es Java 8, solo se acepta Java 8; si es 17 o superior, se acepta la versión exacta o una más nueva.
- Las rutas elegidas manualmente se guardan por versión mayor en `settings.javaPaths`, de modo que Java 8 para 1.12.2 y Java 25 para 26.3 no se pisan entre sí.
- Si falta el Java necesario, el aviso de **Jugar** ofrece **Elegir Java…** (usar un ejecutable ya instalado) o **Instalar Java N…** (descargar un JRE de Adoptium y elegir la carpeta de instalación). Al terminar, el lanzamiento se reintenta automáticamente.
- Si una ruta manual no es válida o es demasiado antigua, el lanzamiento se detiene con un mensaje claro que indica la versión requerida y las detectadas.
- Los instaladores de Forge y NeoForge usan el mismo Java que se elegiría para la versión base.
- Los argumentos JVM se añaden a los de Minecraft. El botón **Flags recomendados** de Ajustes inserta un conjunto habitual para G1GC.
- Los argumentos del juego se separan respetando comillas simples y dobles.

Ejemplo de argumentos JVM:

```text
-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200
```

---

## Limitaciones de las cuentas offline

- **No hay inicio de sesión con Microsoft.** No se puede acceder a Realms, skins/capas de cuenta, logros online ni servidores en `online-mode=true`.
- **Los servidores deben permitir jugadores offline** (`online-mode=false` en `server.properties`). Si un servidor rechaza la conexión, es el comportamiento esperado.
- **La identidad depende del nombre.** El UUID se deriva del nombre del jugador; si cambias de nombre, Minecraft te verá como otro jugador.
- **Los mods deben coincidir con la versión y el cargador.** Nexy puede instalar el cargador y descargar mods, pero no garantiza que un mod concreto sea estable o compatible con todos los demás.
- **La carpeta `mods` pertenece a la instancia activa.** Para alternar entre versiones o cargadores muy distintos, crea instancias separadas y no mezcles mods incompatibles.
- **Los catálogos de cargadores dependen de sus servicios oficiales.** Si Fabric Meta, Quilt Meta, Forge Maven o NeoForge Maven no están disponibles, la lista o la instalación pueden fallar; revisa la consola y tu conexión.
- **CurseForge requiere una API key y permite restricciones del autor.** Algunos archivos no se pueden descargar desde terceros; en ese caso el botón aparece como **No disponible**.
- **No se descargan skins ni contenido de terceros fuera de los catálogos de mods.** Solo se obtienen archivos públicos de Mojang y de los proveedores de mods. Los mundos solo llegan si forman parte de un modpack importado o de una exportación de NexyLauncher.
- **La importación de CurseForge depende de su API.** Sin API key, un modpack con archivos descargables se rechaza; sin conexión, la instancia se crea solo con los overrides incluidos.
- Algunas versiones muy antiguas pueden requerir ajustes adicionales de Java o librerías; revisa la consola si el juego se cierra al iniciar.

---

## Seguridad

- El renderer no tiene acceso a Node.js: `contextIsolation: true`, `nodeIntegration: false`.
- Todo lo que necesita la interfaz pasa por `preload.js` y canales IPC concretos.
- Los datos de IPC se validan en el proceso principal: nombres, direcciones, IDs de versión, rutas de mods, ajustes, descripciones, carátulas y enlaces externos.
- Las carátulas se validan como data URL de imagen (`png`, `jpeg` o `webp`), se recodifican con `nativeImage` y se limitan a 800×450 y 1,2 MB.
- Las rutas de versiones y mods se normalizan y se comprueban contra su directorio raíz para evitar travesías.
- La CSP bloquea scripts y conexiones no locales en la interfaz (`connect-src 'none'`). Las imágenes remotas de los catálogos solo se permiten por HTTPS.
- Las descargas se limitan a dominios oficiales permitidos (Mojang, Fabric/Quilt, Forge/NeoForge, Modrinth y CurseForge/ForgeCDN) y a un tamaño máximo.
- La navegación y las ventanas nuevas se restringen; solo se abren enlaces `http`/`https` con el navegador del sistema.
- El portapapeles se gestiona desde el proceso principal, no desde el renderer.
- La API key de CurseForge se guarda solo en el equipo y se envía únicamente a la API de CurseForge.
- La API key del asistente también se guarda solo en el equipo y nunca llega al renderer. Las peticiones a la IA se hacen desde el proceso principal, por lo que la CSP no necesita abrir conexiones en la interfaz.
- El registro completo de un crash permanece en el proceso principal; el renderer recibe solo metadatos y un extracto, y la IA lo recibe únicamente con consentimiento del usuario.

---

## Estructura del proyecto

```text
main.js               Proceso principal: ventana, IPC, ajustes, Java, lanzamiento,
                      cargadores, modpacks, verificación y proveedores de mods
preload.js            Puente seguro entre renderer y proceso principal
index.html            Estructura de la interfaz y sprites SVG
style.css             Estilos, temas, animaciones y diseño responsive
renderer.js           Núcleo del renderer: estado, cuentas, avatares, avisos
renderer-home.js      Inicio, selector de versión/cargador, dock y consola
renderer-instances.js Instancias: lista, detalle, buscador de mods, ficha de mod, carátula, importar, exportar, ajustes, verificar/reparar, duplicar y eliminar
renderer-pages.js     Gestor de mods, actualizador y buscador
renderer-servers.js   Lista, formulario y estado de servidores
renderer-content.js   Mundos, copias de seguridad, packs, shaders y capturas
renderer-ai.js        Asistente de IA: chat, crash con consentimiento, arreglos y restauración
renderer-updates.js   Aviso de nuevas versiones del launcher y comprobación manual
renderer-i18n.js      Cambio de idioma español/inglés y diccionario de la interfaz
renderer-settings.js  Ajustes, temas, Java, proveedor de mods y API keys
data/                 Datos del launcher y carpeta de juego (se crea al iniciar)
assets/               Icono y panorama de la pantalla de bienvenida
scripts/release.mjs   Compila el MSI y genera dist/updates.json para publicar
scripts/test-update.mjs  Prueba local del aviso con un manifiesto falso
release.config.json   URL base de descargas y modo obligatorio de la actualización
release-notes.md      Notas que se muestran en el aviso de nueva versión
dist/                 Instalador MSI y manifiesto updates.json generados
```

---

## Solución de problemas

**“Falta Java N”**  
El aviso de lanzamiento indica la versión requerida y las detectadas. Pulsa **Instalar Java N…** para descargar un JRE de Adoptium en la carpeta que elijas, o **Elegir Java…** para usar una instalación existente. También puedes revisar las rutas por versión en **Ajustes → Java**.

**“Minecraft se cerró antes de iniciarse”**  
Abre la consola integrada o revisa `<carpeta del juego>\logs\nexy-launcher-last.log`. Comprueba que la versión de Java sea la correcta y que la versión esté completa. Si falla, usa **⋯ → Verificar y reparar** en el detalle de la instancia o elimina su carpeta dentro de `<carpeta del juego>\versions` y vuelve a instalarla.

**El cargador no aparece en la lista o falla al instalarse**  
Comprueba tu conexión. Fabric y Quilt usan sus servicios Meta; Forge y NeoForge usan sus repositorios Maven y un instalador Java. Revisa la consola para ver el error concreto. Si el problema persiste, instala el cargador con su instalador oficial en la misma carpeta del juego: Nexy detectará la versión y podrá lanzarla.

**Forge o NeoForge se queda instalando**  
El instalador puede tardar varios minutos. No cierres el launcher. Si falla, comprueba que haya espacio en disco y que el Java elegido sea compatible con esa versión de Minecraft.

**La API key de CurseForge no funciona**  
Comprueba que la clave esté completa y activa en el portal de CurseForge. Un error `HTTP 403` suele indicar una clave inválida o sin permisos. Modrinth sigue funcionando sin clave.

**El asistente de IA no responde o da error 401/404**  
Revisa en **Ajustes → Asistente de IA** que la clave sea correcta, que la URL base termine en `/v1` (por ejemplo `https://api.openai.com/v1`) y que el modelo exista en ese proveedor. Pulsa **Probar** para comprobarlo. Para Ollama u otros servicios locales, usa `http://localhost:.../v1`.

**Un arreglo de la IA empeoró algo**  
Abre **Asistente** y pulsa **Restaurar antes del arreglo** en la tarjeta del cambio, o **Deshacer arreglo** en la cabecera. Se recuperan los mods y ajustes previos; las copias están en `<instancia>/.nexy/ai-backups/`.

**El servidor rechaza la conexión**  
El servidor probablemente usa `online-mode=true`. Las cuentas offline solo funcionan en servidores que permiten jugadores sin autenticación premium.

**Los mods no aparecen o el juego no arranca con ellos**  
Verifica que sean `.jar` para la misma versión de Minecraft y el mismo cargador (Fabric/Forge/NeoForge/Quilt). Desactiva todos y actívalos uno a uno para encontrar el conflictivo. Comprueba que estás en la instancia correcta: cada instancia tiene su propia carpeta `mods`.

**La importación de un modpack falla o se queda a medias**  
Comprueba que el archivo sea un `.mrpack`, un ZIP de CurseForge o una exportación de NexyLauncher. Los modpacks de CurseForge con archivos descargables necesitan una API key configurada en **Ajustes → Mods e integraciones**. Si la instancia se creó pero faltan mods, abre **Verificar** y pulsa **Reparar**.

**La verificación indica librerías o recursos ausentes**  
Pulsa **Reparar** en la ventana de verificación. Nexy descarga el perfil, el cliente, las librerías y los assets que falten. Si el problema continúa, revisa la consola y la conexión; también puedes eliminar la carpeta de la versión dentro de `<carpeta del juego>\versions` y volver a instalarla.

**La exportación no incluye los mundos o los mods**  
Los mundos solo se incluyen si marcas **Incluir también los mundos guardados**. Los mods deben estar en la carpeta `mods` de la instancia exportada y con extensión `.jar`. Las versiones, librerías y assets no se incluyen: se descargan de nuevo al jugar.

**La ventana aparece en blanco**  
Ejecuta `npm run dev` y revisa la consola de Electron. Comprueba que `npm install` terminó correctamente.

**Quiero restablecer la configuración**  
Usa **Ajustes → Restablecer ajustes** o cierra el launcher y elimina `<carpeta del launcher>\data\settings.json`. No borres `accounts.json` si quieres conservar tus perfiles.

**Quiero empezar de cero**  
Cierra el launcher y renombra o elimina `<carpeta del launcher>\data`. Ten en cuenta que también se borrarán cuentas, servidores y la carpeta del juego si está dentro.

---

## Desarrollo y pruebas

```bash
npm run check
```

### Generar el instalador MSI

```bash
npm install
npm run build:msi
```

El instalador se genera en `dist\NexyLauncher-1.0.0-x64.msi`. Es un MSI WiX **por usuario** (no pide administrador), con accesos directos en el escritorio y el menú Inicio. Al instalar, los datos se guardan en `data\` junto al ejecutable instalado.

La primera compilación descarga Electron y WiX en la caché de `electron-builder`; necesita conexión a Internet. El MSI no está firmado digitalmente, así que Windows SmartScreen puede mostrar un aviso hasta que se firme con un certificado.

### Publicar una actualización

El launcher consulta al arrancar un manifiesto público (`updates.json`). Si la versión publicada es mayor que la instalada, aparece un aviso en **Inicio** y en **Ajustes → Acerca de**. El botón **Descargar** abre el MSI en el navegador; al instalar encima, la carpeta `data\` se conserva.

**1. Configura el alojamiento una sola vez**

- En `main.js`, cambia `UPDATE_MANIFEST_URL` por la URL HTTPS del `updates.json`.
- En `release.config.json`, pon en `downloadBaseUrl` la carpeta HTTPS donde estarán los MSI.

Con GitHub Releases, por ejemplo:

```json
{
  "downloadBaseUrl": "https://github.com/TU-USUARIO/nexy-updates/releases/latest/download",
  "mandatory": false
}
```

```js
const UPDATE_MANIFEST_URL = 'https://github.com/TU-USUARIO/nexy-updates/releases/latest/download/updates.json';
```

**2. Escribe las notas**

Edita `release-notes.md` con una línea `- ...` por cada novedad.

**3. Compila y genera el manifiesto**

```bash
npm run release -- 2.1.0
```

El comando actualiza `package.json`, compila el MSI, calcula el SHA-256 y crea `dist\updates.json` con la URL de descarga.

**4. Sube ambos archivos**

Sube `dist\NexyLauncher-2.1.0-x64.msi` y `dist\updates.json` al mismo release o carpeta. En la siguiente apertura, quien tenga una versión anterior verá el aviso.

Detalles:

- Solo se aceptan manifiestos y descargas por HTTPS (se permite `localhost` para pruebas).
- `"mandatory": true` oculta el botón **Más tarde**; el aviso no se puede descartar.
- El aviso descartado no vuelve a aparecer para esa misma versión.
- En GitHub, el release debe estar **publicado** (no borrador ni pre-release) para que `releases/latest/download/...` funcione.

**Probar sin publicar**

```bash
npm run test:update
```

Abre el launcher con un manifiesto falso (una versión posterior) servido en local y con datos de prueba aislados en `%TEMP%`. Debería aparecer el aviso en Inicio. Cierra la ventana para terminar la prueba.

Para comprobar el manifiesto real, abre en el navegador:

```text
https://github.com/TU-USUARIO/TU-REPO/releases/latest/download/updates.json
```

Debe mostrar el JSON con la última versión. Si da 404, el release no está publicado, no es el último o el archivo no se adjuntó con ese nombre.

Para probar con un manifiesto local sin publicar, apunta `NEXY_UPDATE_URL` a un servidor local:

```powershell
$env:NEXY_UPDATE_URL = "http://127.0.0.1:4599/updates.json"
npm start
```

El proyecto incluye un modo de captura usado durante el desarrollo:

```powershell
$env:NEXY_USER_DATA = "C:\ruta\de\pruebas"
.\node_modules\.bin\electron.cmd . --smoke --smoke-out "C:\ruta\captura.png" --smoke-page home
```

Páginas disponibles para `--smoke-page`: `home`, `instances`, `mods`, `servers`, `content`, `ai`, `settings`.

---

## Licencia

Código bajo licencia MIT. Minecraft, Mojang y Microsoft son marcas de sus respectivos propietarios. Este proyecto no está afiliado ni respaldado por Mojang Studios.
