# ☁️ Despliegue en producción

> ⏸️ **Fuera del alcance de la v2.0.0.** La entrega actual se usa en local con Expo Go (ver el [README](../README.md)). Esta guía queda para cuando se publique el backend; el APK está planificado para la **v3.0.0**.

## 🐘 Base de datos (Neon)

1. 🆕 Crea un proyecto en [Neon](https://console.neon.tech) con **Postgres 18** (la versión por defecto; hace falta 16 o posterior), **en la misma región que el servicio de Render** o la más cercana. Cada consulta es un viaje de red y algunas pantallas (como los informes de administración) hacen una docena seguidas.
2. 🔗 En **Connect**, copia la cadena de conexión (la *pooled* sirve) y cambia `sslmode=require` por `sslmode=verify-full` (mismo cifrado, sin el aviso de seguridad de `pg`).
3. 🔒 Ponla en `DATABASE_URL` del entorno del servidor, **nunca en el repo ni en la app**. Con `NODE_ENV=production` el servidor no arranca sin ella.
   - ⏱️ Tiempos máximos (en `backend/src/db/pg-driver.ts`): Postgres cancela a los **15 s** una sentencia dentro de una transacción (`SET LOCAL statement_timeout`, compatible con la conexión *pooled*), y el servidor deja de esperar cualquier consulta a los **20 s**.
4. 🧱 Al arrancar, el servidor crea o actualiza las tablas solo (migraciones en `backend/src/db/migrations.ts`, anotadas en `schema_migrations`).
5. 🛡️ **Primer administrador:** ejecuta `make-admin` con la `DATABASE_URL` de producción **solo para ese comando**, en la terminal. **Nunca la escribas en `backend/.env`**: así ni `npm run backend` ni la semilla tocan producción por descuido. Una variable definida en la terminal gana a `backend/.env`:

   ```bash
   # bash
   DATABASE_URL='postgresql://…' npm run make-admin -w backend -- <correo>
   ```

   ```powershell
   # PowerShell
   $env:DATABASE_URL='postgresql://…'; npm run make-admin -w backend -- <correo>; Remove-Item Env:DATABASE_URL
   ```

   - `make-admin` solo abre una base que ya tenga el esquema **en la misma versión que tu copia del código**. No la migra (eso lo hace el servidor desplegado al arrancar), así que despliega antes y usa el mismo commit.
   - 🚫 La semilla es solo para desarrollo: si `DATABASE_URL` no apunta a esta máquina, se niega a escribir (salvo con `-- --allow-remote`, para una base de pruebas), porque crea cuentas con contraseña conocida, una de ellas ADMIN.
6. 🧪 **Antes de desplegar en Render**, arranca el servidor una vez contra un proyecto Neon de pruebas (con su `DATABASE_URL` real) y comprueba salud, inicio de sesión, Inicio y `make-admin`. Los tests no usan red, así que Neon no se prueba automáticamente.

---

## 🌐 Backend (Render)

| Variable | Valor recomendado | ¿Por qué? |
|---|---|---|
| `NODE_ENV` | `production` | Exige `DATABASE_URL` y desactiva comportamientos de desarrollo |
| `DATABASE_URL` | Cadena de Neon con `sslmode=verify-full` | Base de datos de producción |
| `JWT_SECRET` | Valor largo y aleatorio (distinto al de desarrollo) | Firma de los tokens |
| `TZ` | `America/Lima` | 🕐 Los planes confirmados (`scheduledAt`, `scheduledDate`) se calculan en esta zona. Sin ella el servidor usa UTC y los planes caerían en otra fecha u hora |
| `TRUST_PROXY` | `1` | 🧱 Render pone un proxy delante. Sin esto, todas las peticiones parecen venir de la misma IP y el límite de intentos de login (`LOGIN_RATE_LIMIT`) y de registro (`REGISTER_RATE_LIMIT`) bloquearía a todos a la vez |
| `GEMINI_API_KEY` | Tu clave | IA (opcional) |

> ⚙️ Comandos: build `npm install && npm run build -w backend` · start `npm start -w backend`.
