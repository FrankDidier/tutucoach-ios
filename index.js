/**
 * @format
 */

import {AppRegistry, LogBox} from 'react-native';
import App from './App';
import {name as appName} from './app.json';

// Keep tab bar tappable during emulator 1:1 verify (LogBox banner otherwise steals bottom taps).
LogBox.ignoreAllLogs(true);

AppRegistry.registerComponent(appName, () => App);
