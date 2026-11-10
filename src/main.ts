import { features } from './registry';

for (const feature of features) feature.setup();
document.querySelector('#app')?.append('SUPERMARCHÉ APOCALYPSE');
