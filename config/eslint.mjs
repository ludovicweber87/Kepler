import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

import baseConfig from './base.mjs';

const eslintConfig = [...nextVitals, ...nextTs, ...baseConfig];

export default eslintConfig;
