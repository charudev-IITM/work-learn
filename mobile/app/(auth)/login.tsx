import { useState, useRef } from 'react';
import {
  View, Text, TextInput, Pressable, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Redirect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../src/contexts/AuthContext';

export default function LoginScreen() {
  const { flowStep, isLoading, error, isAuthenticated, sendOTP, verifyOTP, clearError, resetFlow, pendingPhone } = useAuth();
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const otpRef = useRef<TextInput>(null);

  if (isAuthenticated && flowStep === 'authenticated') {
    return <Redirect href="/(tabs)" />;
  }

  const handleSendOTP = async () => {
    if (phone.length < 10) return;
    try {
      await sendOTP(phone);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      otpRef.current?.focus();
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length < 6 || !pendingPhone) return;
    try {
      await verifyOTP(pendingPhone, otp);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const isOTPStep = flowStep === 'otp_verification';

  return (
    <SafeAreaView className="flex-1 bg-surface">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View className="flex-1 justify-center px-6">
          {/* Brand */}
          <Text className="text-gold text-4xl font-extrabold text-center">
            SpotCompare
          </Text>
          <Text className="text-gray-500 text-sm text-center mt-2 mb-12">
            Real-time bullion rate comparison
          </Text>

          {!isOTPStep ? (
            <View>
              <Text className="text-gray-300 text-sm mb-2">Phone Number</Text>
              <View className="flex-row items-center bg-surface-card rounded-xl px-4">
                <Text className="text-gray-500 text-base mr-2">+91</Text>
                <TextInput
                  className="flex-1 text-white text-lg py-4"
                  placeholder="Enter phone number"
                  placeholderTextColor="#666"
                  keyboardType="phone-pad"
                  maxLength={10}
                  value={phone}
                  onChangeText={(t) => { setPhone(t); clearError(); }}
                  autoFocus
                />
              </View>

              <Pressable
                onPress={handleSendOTP}
                disabled={phone.length < 10 || isLoading}
                className={`mt-4 py-4 rounded-xl items-center ${
                  phone.length >= 10 ? 'bg-gold' : 'bg-surface-elevated'
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text className="text-black text-base font-bold">Send OTP</Text>
                )}
              </Pressable>
            </View>
          ) : (
            <View>
              <Text className="text-gray-300 text-sm mb-2">
                Enter OTP sent to +91{pendingPhone}
              </Text>
              <TextInput
                ref={otpRef}
                className="bg-surface-card rounded-xl px-4 py-4 text-white text-2xl text-center tracking-widest"
                placeholder="000000"
                placeholderTextColor="#666"
                keyboardType="number-pad"
                maxLength={6}
                value={otp}
                onChangeText={(t) => { setOtp(t); clearError(); }}
                autoFocus
              />

              <Pressable
                onPress={handleVerifyOTP}
                disabled={otp.length < 6 || isLoading}
                className={`mt-4 py-4 rounded-xl items-center ${
                  otp.length >= 6 ? 'bg-gold' : 'bg-surface-elevated'
                }`}
              >
                {isLoading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text className="text-black text-base font-bold">Verify OTP</Text>
                )}
              </Pressable>

              <Pressable
                onPress={() => { resetFlow(); setOtp(''); }}
                className="mt-4 items-center"
              >
                <Text className="text-gold text-sm">Change phone number</Text>
              </Pressable>
            </View>
          )}

          {error && (
            <Text className="text-red-500 text-sm text-center mt-4">{error}</Text>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
