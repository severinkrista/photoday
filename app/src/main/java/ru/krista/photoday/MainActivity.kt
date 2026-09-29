package ru.krista.photoday
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.yandex.authsdk.YandexAuthLoginOptions
import com.yandex.authsdk.YandexAuthOptions
import com.yandex.authsdk.YandexAuthSdk
import ru.krista.photoday.model.TaskRecord
import java.time.format.DateTimeFormatter

class MainActivity:ComponentActivity(){
 private val vm:MainViewModel by viewModels();private lateinit var sdk:YandexAuthSdk
 private val launcher by lazy{registerForActivityResult(sdk.contract){vm.auth(it)}}
 override fun onCreate(b:Bundle?){super.onCreate(b);sdk=YandexAuthSdk.create(YandexAuthOptions(this));setContent{MaterialTheme{Screen(vm)}}}
 @Composable private fun Screen(vm:MainViewModel){
  val s by vm.state;var days by remember(s.days){mutableStateOf(s.days.toString())}
  Scaffold(topBar={TopAppBar(title={Text("Фото дня")})}){p->Column(Modifier.fillMaxSize().padding(p).padding(16.dp)){
   Text("Файлы / Криста / Программы / photoday.xlsx",style=MaterialTheme.typography.bodyMedium);Spacer(Modifier.height(12.dp))
   if(!s.connected)Button({launcher.launch(YandexAuthLoginOptions())},Modifier.fillMaxWidth()){Text("Подключить Яндекс Диск")}
   else{
    Row(horizontalArrangement=Arrangement.spacedBy(8.dp),modifier=Modifier.fillMaxWidth()){
     OutlinedTextField(days,{days=it.filter(Char::isDigit).take(2)},label={Text("Последние дней")},singleLine=true,modifier=Modifier.weight(1f))
     Button({vm.days(days.toLongOrNull()?:2)}){Text("Обновить")}
    }
    Spacer(Modifier.height(8.dp));Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){OutlinedButton({vm.refresh()}){Text("Обновить")};OutlinedButton({vm.logout()}){Text("Отключить")}}
   }
   s.message?.let{Spacer(Modifier.height(8.dp));Text(it,style=MaterialTheme.typography.bodySmall)}
   if(s.loading){Spacer(Modifier.height(12.dp));CircularProgressIndicator()}
   Spacer(Modifier.height(12.dp));LazyColumn(verticalArrangement=Arrangement.spacedBy(8.dp)){items(s.records,key={it.rowNumber}){Card(Modifier.fillMaxWidth()){TaskRow(it)}}}
  }}
 }
 @Composable private fun TaskRow(r:TaskRecord){Column(Modifier.padding(12.dp)){
  Text((r.date?.format(DateTimeFormatter.ofPattern("dd.MM.yyyy"))?:"Без даты")+" "+(r.time?.format(DateTimeFormatter.ofPattern("HH:mm"))?:""),style=MaterialTheme.typography.labelMedium)
  if(r.type.isNotBlank())Text(r.type,style=MaterialTheme.typography.titleMedium)
  Text(r.task,style=MaterialTheme.typography.bodyLarge)
  val d=listOf(r.dayOfWeek,r.partOfDay,r.difficulty?.let{"Сложность: $it"}).filter{!it.isNullOrBlank()}.joinToString(" • ")
  if(d.isNotBlank())Text(d,style=MaterialTheme.typography.bodySmall)
 }}
}