// Prevents an extra console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod dev;
mod engine;
mod licence;
mod models;
mod shell;
mod store;
mod strings;
mod updater;

use tauri::{Manager, RunEvent};

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_window_state::Builder::new().build())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(engine::Engine::start())
    .manage(store::Store::default())
    .manage(shell::Seal::default())
    .setup(|app| {
      shell::install(app)?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      engine::lm_load,
      engine::lm_generate,
      engine::lm_abort,
      engine::lm_stats,
      engine::lm_unload,
      engine::lm_embed,
      store::db_open,
      store::db_exec,
      store::db_run,
      store::db_all,
      store::db_batch,
      licence::licence_secret,
      licence::licence_device_id,
      licence::licence_load,
      licence::licence_save,
      licence::licence_clear,
      licence::licence_cache_load,
      licence::licence_cache_save,
      licence::licence_cache_clear,
      models::models_list,
      models::models_space,
      models::models_import,
      models::models_pick,
      models::models_remove,
      shell::seal_state,
      shell::desktop_info,
      updater::updater_check,
      updater::updater_install,
      dev::dev_write_result,
    ])
    .build(tauri::generate_context!())
    .expect("error while building Inborn")
    .run(|app, event| {
      // "Quit unloads model" (spec §8.9): release the weights before the process goes away.
      if let RunEvent::ExitRequested { .. } = event {
        app.state::<engine::Engine>().unload_blocking();
      }
    });
}
