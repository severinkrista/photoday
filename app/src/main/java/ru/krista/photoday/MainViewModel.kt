package ru.krista.photoday
import android.app.Application
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.yandex.authsdk.YandexAuthResult
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import ru.krista.photoday.data.TokenStore
import ru.krista.photoday.data.XlsxReader
import ru.krista.photoday.data.YandexDiskRepository
import ru.krista.photoday.model.TaskRecord
import java.io.File

data class MainUiState(val connected:Boolean=false,val loading:Boolean=false,val days:Long=2,val records:List<TaskRecord> = emptyList(),val message:String?=null)
class MainViewModel(app:Application):AndroidViewModel(app){
 private val token=TokenStore(app);private val disk=YandexDiskRepository();private val reader=XlsxReader();private val file=File(app.cacheDir,"photoday.xlsx")
 val state=mutableStateOf(MainUiState(connected=token.get()!=null))
 fun days(v:Long){state.value=state.value.copy(days=v.coerceIn(1,30));if(token.get()!=null)refresh()}
 fun auth(result:YandexAuthResult){
  when(result){
   is YandexAuthResult.Success->{token.save(result.token.value);state.value=state.value.copy(connected=true,message="Яндекс Диск подключён");refresh()}
   is YandexAuthResult.Failure->state.value=state.value.copy(message="Ошибка авторизации: "+(result.exception.message?:"неизвестная ошибка"))
   YandexAuthResult.Cancelled->state.value=state.value.copy(message="Авторизация отменена")
  }
 }
 fun refresh(){val t=token.get()?:return state.value.also{state.value=it.copy(message="Сначала подключите Яндекс")};viewModelScope.launch{
  state.value=state.value.copy(loading=true,message=null)
  runCatching{withContext(Dispatchers.IO){disk.downloadFile(t,file);reader.read(file,state.value.days)}}.onSuccess{r->state.value=state.value.copy(loading=false,records=r,message="Загружено: "+r.size)}.onFailure{e->state.value=state.value.copy(loading=false,message=e.message?:"Ошибка загрузки")}
 }}
 fun logout(){token.clear();state.value=MainUiState()}
}