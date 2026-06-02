/// <reference types="react-native-css-interop/types" />

// Additional className support not covered by css-interop
import 'react-native';
import 'react-native-safe-area-context';

declare module 'react-native' {
  interface PressableProps {
    className?: string;
  }
  interface TextInputProps {
    className?: string;
  }
}

declare module 'react-native-safe-area-context' {
  interface NativeSafeAreaViewProps {
    className?: string;
  }
}
