// Función de servidor: administración de cuentas (solo administradores).
//
// POST { accion: "crear",       correo, nombre, rol, password }
// POST { accion: "actualizar",  id, nombre?, rol?, activo? }
// POST { accion: "restablecer", id, password }
// POST { accion: "eliminar",    id }
import { clienteServicio, ErrorHttp, json, manejar, usuarioActual } from "../_shared/comun.ts";

const ROLES = ["admin", "docente"];

Deno.serve(manejar(async (req) => {
  const db = clienteServicio();
  const yo = await usuarioActual(req, db);
  if (yo.rol !== "admin") throw new ErrorHttp(403, "Solo un administrador puede gestionar usuarios");

  const b = await req.json().catch(() => ({}));
  const auditar = (accion: string, id: string, detalle: unknown) =>
    db.from("auditoria").insert({ usuario_id: yo.id, usuario: yo.nombre || yo.correo, tabla: "usuarios", accion, registro_id: id, detalle });

  switch (b.accion) {
    case "crear": {
      const correo = String(b.correo ?? "").trim().toLowerCase();
      const nombre = String(b.nombre ?? "").trim();
      const rol = ROLES.includes(b.rol) ? b.rol : "docente";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new ErrorHttp(400, "Correo inválido");
      if (!nombre) throw new ErrorHttp(400, "El nombre es obligatorio");
      if (String(b.password ?? "").length < 8) throw new ErrorHttp(400, "La contraseña debe tener al menos 8 caracteres");
      const { data, error } = await db.auth.admin.createUser({
        email: correo, password: b.password, email_confirm: true,
        user_metadata: { nombre }, app_metadata: { rol, invitado: true },
      });
      if (error) throw new ErrorHttp(400, error.message.includes("already") ? "Ya existe un usuario con ese correo" : error.message);
      await db.from("perfiles").upsert({ id: data.user.id, nombre, correo, rol, activo: true });
      await auditar("CREAR", data.user.id, { correo, rol });
      return json({ ok: true, id: data.user.id });
    }
    case "actualizar": {
      if (!b.id) throw new ErrorHttp(400, "Falta el id");
      const cambios: Record<string, unknown> = {};
      if (typeof b.nombre === "string" && b.nombre.trim()) cambios.nombre = b.nombre.trim();
      if (ROLES.includes(b.rol)) cambios.rol = b.rol;
      if (typeof b.activo === "boolean") cambios.activo = b.activo;
      if (b.id === yo.id && (cambios.rol === "docente" || cambios.activo === false)) {
        throw new ErrorHttp(400, "No puede quitarse a sí mismo el rol de administrador ni desactivarse");
      }
      const { error } = await db.from("perfiles").update(cambios).eq("id", b.id);
      if (error) throw new ErrorHttp(400, error.message);
      await auditar("ACTUALIZAR", b.id, cambios);
      return json({ ok: true });
    }
    case "restablecer": {
      if (!b.id) throw new ErrorHttp(400, "Falta el id");
      if (String(b.password ?? "").length < 8) throw new ErrorHttp(400, "La contraseña debe tener al menos 8 caracteres");
      const { error } = await db.auth.admin.updateUserById(b.id, { password: b.password });
      if (error) throw new ErrorHttp(400, error.message);
      await auditar("RESTABLECER_CLAVE", b.id, {});
      return json({ ok: true });
    }
    case "eliminar": {
      if (!b.id) throw new ErrorHttp(400, "Falta el id");
      if (b.id === yo.id) throw new ErrorHttp(400, "No puede eliminar su propia cuenta");
      const { error } = await db.auth.admin.deleteUser(b.id);
      if (error) throw new ErrorHttp(400, error.message);
      await auditar("ELIMINAR", b.id, {});
      return json({ ok: true });
    }
    default:
      throw new ErrorHttp(400, "Acción no válida");
  }
}));
