## NexyLauncher 1.1.0

### Novedades

<!-- Añade aquí las novedades de la 1.1.0: una línea "- ..." por cada una. -->

- **Instalador EXE con carpeta a elegir**: el nuevo instalador NSIS permite elegir la ubicación, crea accesos directos y no exige administrador. Sustituye al MSI anterior.
- **Actualizaciones sin perder datos**: cuentas, instancias, servidores, skins y ajustes viven en `%APPDATA%\NexyLauncher`. Puedes instalar en otra carpeta sin mover nada; los datos antiguos se migran solos.
- **Modo portable**: con un `portable.txt` junto al `.exe`, los datos se guardan en `data\` y puedes llevarlo en una unidad USB.
- **Cuentas Microsoft en el launcher**: inicia sesión con tu cuenta real de Minecraft: Java Edition desde la pantalla de bienvenida o desde **Cuenta y perfiles**, sin crear una aplicación en Azure ni esperar la aprobación de Mojang.
- **Inicio de sesión por código temporal**: el launcher muestra un código que introduces en `microsoft.com/link`. Nunca pide tu contraseña y no guarda tokens: la sesión vive solo en memoria y caduca al cerrar NexyLauncher.
- **Perfiles Microsoft y offline juntos**: activa una cuenta Microsoft como perfil, cámbiala cuando quieras y usa **Jugar** con autenticación real (compatible con servidores premium). Si la sesión caducó, el launcher pide iniciar sesión de nuevo.
- **Gestión de cuentas**: consulta si una cuenta Microsoft está activa o caducada, inicia o cierra su sesión sin borrar el perfil y elimínala del launcher sin tocar tus mundos.
- **Privacidad**: de las cuentas Microsoft solo se guardan el nombre, el UUID y el XUID públicos. Los tokens de Microsoft, Xbox Live, XSTS y Minecraft no se escriben en disco.
- **Skins reales en la interfaz**: la cara del perfil se recorta de la skin de Minecraft de la cuenta Microsoft. Las cuentas offline pueden subir su propia skin PNG (64×64 o 64×32), cambiarla o quitarla desde **Cuenta y perfiles → Skin**.
- **Selector rápido de perfiles**: el botón de cuenta de la barra superior abre una lista para cambiar entre perfiles Microsoft y offline sin entrar en la gestión completa.
- **Sesión más duradera**: la sesión de Microsoft se renueva automáticamente unos minutos antes de caducar y la interfaz muestra la hora de caducidad en las cuentas activas.
- **Una carpeta por instancia**: cada instancia vive en `<carpeta de datos>\instances\<nombre>` y su carpeta se renombra al cambiar el nombre. Las instalaciones antiguas con `.minecraft` en la carpeta de datos se trasladan solas a la nueva carpeta.
- **Ficha e icono en la carpeta**: cada instancia guarda `instancia.md` (descripción, versión, cargador y fechas) e `icono.png` (carátula). Se actualizan al editar la instancia y se adoptan si mueves la carpeta.
- **Importar instancias de otros launchers**: detecta automáticamente CurseForge, Modrinth, Prism Launcher, MultiMC, PolyMC, GDLauncher, Dawn Launcher, Feather, ATLauncher, Technic y los perfiles del launcher oficial, y deja elegir qué instancias importar. Si la detección falla, puedes seleccionar la carpeta raíz del launcher a mano. Se usan en su carpeta original, sin copiar archivos.
- **Mods en carpetas**: los mods activos están en `mods\` y los desactivados en `mods\.desactivados\`, así Minecraft solo carga los que toca. Los `.jar.disabled` antiguos se migran solos y las copias duplicadas se limpian al arrancar o al instalar una versión nueva.
- **Copias automáticas de mundos**: antes de lanzar se copian solo los mundos que han cambiado desde la última copia y se conservan las últimas 6 por mundo (configurable entre 1 y 50) en `.nexy\backups\worlds`.
- **Historial de sesiones**: cada partida guarda instancia, versión, cargador, cuenta, duración, código de salida y si terminó con error. Se consulta desde **Ajustes → Copias y sesiones** y se resume en Inicio.
- **Compartir registros en mclo.gs**: la consola y el `latest.log` se suben a mclo.gs con un botón y el enlace se copia al portapapeles, sin cuenta ni clave.
- **Servidores locales**: crea un servidor Vanilla oficial desde la página **Servidores**, con descarga verificada del `.jar` de Mojang, EULA, `server.properties`, puerto comprobado, memoria configurable y `online-mode` opcional. Arranca, detén y envía comandos desde una consola integrada; al cerrar el launcher los servidores en marcha se detienen de forma ordenada.
- **Java automático**: si una instancia o un servidor local necesita una versión de Java que no está instalada, NexyLauncher descarga el JRE de Adoptium en `<carpeta de datos>\java`, lo asigna a esa versión y reintenta el arranque. Ya no hay que elegir carpeta ni instalar Java a mano.

### Instalación

Descarga `NexyLauncher-1.1.0-x64.exe`, ejecútalo y elige la carpeta donde quieras instalarlo. Tus datos se guardan en `%APPDATA%\NexyLauncher` y se conservan al actualizar o al cambiar de carpeta. Si prefieres un launcher portable, crea un `portable.txt` junto al `.exe`.

> Proyecto independiente. No está afiliado a Mojang Studios ni a Microsoft.

### Historial

**1.0.0**: cuentas offline, instancias aisladas, mods de Modrinth y CurseForge, servidores guardados, contenido local, asistente de IA, avisos de actualización, interfaz bilingüe, verificación y reparación de instancias, importación y exportación de modpacks y ajustes de memoria, Java y resolución.
