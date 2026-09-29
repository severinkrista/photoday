package ru.krista.photoday.data
import android.content.Context
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
class TokenStore(context:Context){
 private val prefs=context.getSharedPreferences("secure_tokens",Context.MODE_PRIVATE);private val alias="photoday_yandex_token"
 init{ensureKey()}
 fun save(token:String){val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());val e=c.doFinal(token.toByteArray(Charsets.UTF_8));prefs.edit().putString("iv",Base64.encodeToString(c.iv,Base64.NO_WRAP)).putString("value",Base64.encodeToString(e,Base64.NO_WRAP)).apply()}
 fun get():String?{val iv=prefs.getString("iv",null)?:return null;val v=prefs.getString("value",null)?:return null;return runCatching{val c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,Base64.decode(iv,Base64.NO_WRAP)));String(c.doFinal(Base64.decode(v,Base64.NO_WRAP)),Charsets.UTF_8)}.getOrNull()}
 fun clear(){prefs.edit().clear().apply()}
 private fun ensureKey(){val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};if(!ks.containsAlias(alias))KeyGenerator.getInstance("AES","AndroidKeyStore").apply{init(256);generateKey()}}
 private fun key():SecretKey{val ks=KeyStore.getInstance("AndroidKeyStore").apply{load(null)};return(ks.getEntry(alias,null)as KeyStore.SecretKeyEntry).secretKey}
}