package com.example.hueckoapp.ui.group

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun CreateGroupDialog(
    viewModel: GroupViewModel,
    onDismiss: () -> Unit
) {
    var groupName by remember { mutableStateOf("") }
    val isLoading by viewModel.isLoading
    val errorMessage by viewModel.errorMessage

    AlertDialog(
        onDismissRequest = { if (!isLoading) onDismiss() },
        title = { Text("Crear Nuevo Grupo") },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                OutlinedTextField(
                    value = groupName,
                    onValueChange = { 
                        groupName = it
                        viewModel.clearError() 
                    },
                    label = { Text("Nombre del grupo") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                
                if (errorMessage != null) {
                    Text(
                        text = errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { viewModel.createGroup(groupName, onSuccess = onDismiss) },
                enabled = groupName.isNotBlank() && !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Crear")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isLoading) {
                Text("Cancelar")
            }
        }
    )
}

@Composable
fun JoinGroupDialog(
    viewModel: GroupViewModel,
    onDismiss: () -> Unit
) {
    var inviteCode by remember { mutableStateOf("") }
    val isLoading by viewModel.isLoading
    val errorMessage by viewModel.errorMessage

    AlertDialog(
        onDismissRequest = { if (!isLoading) onDismiss() },
        title = { Text("Unirse a un Grupo") },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text("Ingresa el código de invitación que te compartió el administrador del grupo.", style = MaterialTheme.typography.bodyMedium)
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = inviteCode,
                    onValueChange = { 
                        inviteCode = it.uppercase() // Forzar mayúsculas
                        viewModel.clearError()
                    },
                    label = { Text("Código de Invitación") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                
                if (errorMessage != null) {
                    Text(
                        text = errorMessage!!,
                        color = MaterialTheme.colorScheme.error,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { viewModel.joinGroup(inviteCode, onSuccess = onDismiss) },
                enabled = inviteCode.isNotBlank() && !isLoading
            ) {
                if (isLoading) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary)
                } else {
                    Text("Unirse")
                }
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss, enabled = !isLoading) {
                Text("Cancelar")
            }
        }
    )
}
