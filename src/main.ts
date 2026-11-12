import App from "@/App.vue";
import "@/assets/css/global.css";
import { installWebIpcShim } from "@/lib/web-ipc-shim";
import { createPinia } from "pinia";
import { createApp } from "vue";
import "vue-sonner/style.css";

installWebIpcShim();

const app = createApp(App);

app.use(createPinia());

app.mount("#app");
