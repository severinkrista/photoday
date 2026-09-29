package ru.krista.photoday.data
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder

class YandexDiskRepository(private val client:OkHttpClient=OkHttpClient()){
 companion object{private const val API="https://cloud-api.yandex.net/v1/disk";const val FILE_PATH="disk:/Файлы/Криста/Программы/photoday.xlsx"}
 fun downloadFile(token:String,target:File){
  val p=URLEncoder.encode(FILE_PATH,"UTF-8")
  client.newCall(Request.Builder().url(API+"/resources?path="+p).header("Authorization","OAuth "+token).build()).execute().use{r->if(!r.isSuccessful)throw IllegalStateException("Не удалось найти photoday.xlsx: HTTP "+r.code)}
  val href=client.newCall(Request.Builder().url(API+"/resources/download?path="+p).header("Authorization","OAuth "+token).build()).execute().use{r->
   if(!r.isSuccessful)throw IllegalStateException("Не удалось получить ссылку на скачивание: HTTP "+r.code)
   JSONObject(r.body?.string()?:error("Пустой ответ Яндекс Диска")).getString("href")
  }
  client.newCall(Request.Builder().url(href).get().build()).execute().use{r->
   if(!r.isSuccessful)throw IllegalStateException("Ошибка скачивания XLSX: HTTP "+r.code)
   val body=r.body?:error("Пустой XLSX");target.outputStream().use{out->body.byteStream().copyTo(out)}
  }
 }
}