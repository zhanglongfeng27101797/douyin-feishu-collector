package com.masterorange.liuguang.data

import android.annotation.SuppressLint
import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.masterorange.liuguang.domain.SpeechProvider
import com.masterorange.liuguang.domain.UserServiceConfiguration
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

interface UserConfigurationStore {
    fun load(): UserServiceConfiguration?
    fun save(configuration: UserServiceConfiguration)
    fun clear()
}

@SuppressLint("UseKtx")
class KeystoreUserConfigurationStore(context: Context) : UserConfigurationStore {
    private val preferences = context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE)

    override fun load(): UserServiceConfiguration? {
        val payload = preferences.getString(KEY_PAYLOAD, null) ?: return null
        val iv = preferences.getString(KEY_IV, null) ?: return null
        val root = Json.parseToJsonElement(decrypt(payload, iv)).jsonObject
        return UserServiceConfiguration(
            feishuAppId = root.getValue("feishuAppId").jsonPrimitive.content,
            feishuAppSecret = root.getValue("feishuAppSecret").jsonPrimitive.content,
            feishuBaseUrl = root.getValue("feishuBaseUrl").jsonPrimitive.content,
            speechProvider = SpeechProvider.valueOf(root.getValue("speechProvider").jsonPrimitive.content),
            speechApiKey = root.getValue("speechApiKey").jsonPrimitive.content,
        ).normalized()
    }

    override fun save(configuration: UserServiceConfiguration) {
        val value = configuration.normalized()
        val json = buildJsonObject {
            put("feishuAppId", value.feishuAppId)
            put("feishuAppSecret", value.feishuAppSecret)
            put("feishuBaseUrl", value.feishuBaseUrl)
            put("speechProvider", value.speechProvider.name)
            put("speechApiKey", value.speechApiKey)
        }.toString()
        val encrypted = encrypt(json)
        check(preferences.edit().putString(KEY_PAYLOAD, encrypted.payload).putString(KEY_IV, encrypted.iv).commit()) {
            "无法安全保存服务配置"
        }
    }

    override fun clear() {
        check(preferences.edit().clear().commit()) { "无法清除本地配置" }
        keyStore().takeIf { it.containsAlias(KEY_ALIAS) }?.deleteEntry(KEY_ALIAS)
    }

    private fun encrypt(value: String): EncryptedValue {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        return EncryptedValue(
            Base64.encodeToString(cipher.doFinal(value.toByteArray()), Base64.NO_WRAP),
            Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
        )
    }

    private fun decrypt(payload: String, iv: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(
            Cipher.DECRYPT_MODE,
            secretKey(),
            GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
        )
        return cipher.doFinal(Base64.decode(payload, Base64.NO_WRAP)).toString(Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        val keyStore = keyStore()
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE).run {
            init(
                KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build(),
            )
            generateKey()
        }
    }

    private fun keyStore(): KeyStore = KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
    private data class EncryptedValue(val payload: String, val iv: String)

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_ALIAS = "liuguang.user-service-configuration"
        private const val PREFERENCES_NAME = "liuguang.user-service-configuration"
        private const val KEY_PAYLOAD = "encrypted_payload"
        private const val KEY_IV = "payload_iv"
    }
}
