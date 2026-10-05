import { createApp } from 'vue'
import App from '@video-core/web/App.vue'
import ProductSource from './ProductSource.vue'
import './style.css'

createApp(App, { sourceForm: ProductSource }).mount('#app')
