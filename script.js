//;document.body.addEventListener('touchmove',function(e){
//     e.preventDefault();
//});

var mobilemode = false;

function upd_mobilemode() {
	if (window.innerWidth < 700) {
		mobilemode = true;
		chat.enterMobile()
	} else {
		mobilemode = false;
		chat.exitMobile()
	}
}

window.onresize = upd_mobilemode



$(document).keyup(function(event) {
    if(event.keyCode==13 && $("input[name=msg_input]").val() != "") {
        chat.send();
    }
});
function getCookie(name) {
	var matches = document.cookie.match(new RegExp(
	  "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
	));
	return matches ? decodeURIComponent(matches[1]) : undefined;
}

$( document ).ajaxError(function(a, b) {
	console.log("Ошибка")
	console.log(b.status)
	switch (b.status) {
		case 500: Materialize.toast('Iternal server error!', 5000, 'rounded'); break;
	}
})

PiApi = {
	origin: "https://olegdanilov604.xyz/PiChat/", // Обязательно слеш в конце
	longpool_origin: "https://olegdanilov604.xyz/longpool/", // Обязательно слеш в конце
	wss_server: "wss://olegdanilov604.xyz/PiWSS", // А тут уже похуй
	auth: function(googleUser) {
		var id_token = googleUser.getAuthResponse().id_token;
		$.ajax({
			type: "GET",
			url: this.origin + "user/login.php",
			data: {
				t: id_token
			},
			success: function(data) {
				if (data.success) {
					document.cookie = "key=" + data.key
					chat.start()
				}
			}
		})
	},
	get_contacts: function(callback) {
		$.ajax({
			type: "GET",
			url: this.origin + "messages/messages_list.php",
			data: {
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					let count = 0;
					let req_handler = function(key) {
						let encryption_key = CryptoJS.SHA256(key).toString(); 
      					let message = CryptoJS.AES.decrypt(data.chats[count].last_message.text, encryption_key).toString(CryptoJS.enc.Utf8);
						data.chats[count].last_message.text = message
						count++;
						if (count < data.chats.length) {
							get_encryption_key(data.chats[count].user_id, req_handler);
						} else {
							callback(data.chats)
						}
					}
					get_encryption_key(data.chats[0].user_id, req_handler);
				}
			}
		})
	},
	get_me: function(callback) {
		$.ajax({
			type: "GET",
			url: this.origin + "user/user_info.php",
			data: {
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					callback(data)
				}
			}
		})
	},
	get_sessions: function(callback) {
		$.ajax({
			type: "GET",
			url: this.origin + "auth_sessions/get.php",
			data: {
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					callback(data)
				}
			}
		})
	},
	terminate_sessions: function(id, callback) {
		$.ajax({
			type: "GET",
			url: this.origin + "auth_sessions/terminate.php",
			data: {
				key: getCookie("key"),
				id: id
			},
			success: function(data) {
				if (data.success) {
					callback(data)
				}
			}
		})
	},	
	search: function(keyword, callback) {
		$.ajax({
			type: "GET",
			url: this.origin + "user/search.php",
			data: {
				keyword: keyword,
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					callback(data.data)
				}
			}
		})
	},
	get_history: function(id, callback) {
		$.ajax({
			type: "GET",
			url: this.origin + "messages/get.php",
			data: {
				user_id: id,
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					if (data.messages.length != 0) {
						get_encryption_key(id, function(enc_key) {
							for (i in data.messages) {
								let encryption_key = CryptoJS.SHA256(enc_key).toString(); 
      							let message = CryptoJS.AES.decrypt(data.messages[i]['text'], encryption_key).toString(CryptoJS.enc.Utf8);
								data.messages[i].text = message
							}
							callback(data)
						});
					} else {
						callback([])
					}
				}
			}
		})
	},
	check_online: function(id, callback) {
		$.ajax({
			type: "GET",
			url: this.longpool_origin + "online_check",
			data: {
				user_id: id,
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					callback(data.data)
				}
			}
		})
	},
	send: function(to, text, callback) {
		$.ajax({
			type: "GET",
			url: this.longpool_origin + "send",
			data: {
				to: to,
				text: text,
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					get_encryption_key(data.message.to, function(key) {
						let encryption_key = CryptoJS.SHA256(key).toString(); 
      					let message = CryptoJS.AES.decrypt(data.message.text, encryption_key).toString(CryptoJS.enc.Utf8);
      					data.message.text = message
      					callback(data.message)
					})
				}
			}
		})
	},
	WebSocket: function(onmessage, ononline, onread, resurrection) {
		let is_auth = false

		ws = new WebSocket(this.wss_server)

		ws.onopen = function() {
			ws.send(getCookie("key"))
		}

		ws.onmessage = function(evt) {
			if (!is_auth) {
				if (evt.data == "Auth successful!" || evt.data == "You already auth.") {
					is_auth = true
					setInterval(function() {
						ws.send("ping")
					}, 60000)
				} else if (evt.data == "Key is incorrect!") {
					Materialize.toast('WebSocket server said that your auth key is incorrect!', 5000, 'rounded');
				}
			} else {
				msg = JSON.parse(evt.data)
				switch(msg.type) {
					case "message": onmessage(msg); break;
					case "read": onread(msg.user_id); break;
					case "offline": ononline(false, msg.id, msg.last_seen); break;
					case "online": ononline(true, msg.id); break;
				}
			}
		}

		ws.onerror = function(evt) {
			console.log(evt)
		}

		ws.onclose = function(evt) {
			console.log("WS close")
			console.log(evt)
			if (evt.code == 1000) {
				Materialize.toast('WebSocket server close normally by server-side.', 5000, 'rounded');
			} else if (evt.code == 1001) {
				Materialize.toast('WebSocket server crashed. Oleg or Ilya, pliz perezagruzi srvak.', 5000, 'rounded');
			} else if (evt.code == 1002) {
				Materialize.toast('WebSocket protocol error.', 5000, 'rounded');
			} else if (evt.code == 1003) {
				Materialize.toast('WebSocket close connection on strange cause.', 5000, 'rounded');
			}
		}
	},
	read: function(user_id, callback) {
		$.ajax({
			type: "GET",
			url: this.longpool_origin + "action",
			data: {
				action_id: 1,
				user_id: user_id,
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					callback(true)
				}
			}
		})
	},
	set_me_online: function() {
		$.ajax({
			type: "GET",
			url: this.longpool_origin + "action",
			data: {
				action_id: 3,
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					// Радость!
				}
			}
		})
	},
	set_me_offline: function() {
		$.ajax({
			type: "GET",
			url: this.longpool_origin + "action",
			data: {
				action_id: 4,
				key: getCookie("key")
			},
			success: function(data) {
				if (data.success) {
					// Радость!
				}
			}
		})
	}
}

// ----------------------------------------
// CHAT
// ----------------------------------------

chat = {
	start: function() {
		if (this.is_logged()) { // Авторизация есть
			$("#search").show();
			var result = "";
			result += '<div class="col xl4 m5 leftMenu">'
			result += '</div>'
			result += '<div class="col xl8 s12 m7 msgArea">'
			result += '	<div class="chat">'
			result += '	</div>'
			result += '	<div class="bottom_menu">'
			result += '		<input type="text" name="msg_input" placeholder="Write your message here..." class="message">'
			result += '	</div>'
			result += '</div>'
			$('.content').html(result);
			upd_mobilemode()
			chat.my_id = getCookie('id');
			PiApi.get_me(function(data) {
				chat.my_id = data.user_id;
				PiApi.get_contacts(function(data) {
					chat.draw_contacts(data);
					console.log(data)
					contact_cache.set(data);
					PiApi.set_me_online();
					vis(function() {
						if (vis()) {
							PiApi.set_me_online();
						} else {
							PiApi.set_me_offline();
						}
					})
					PiApi.WebSocket(function(data) { // Новое сообщение
								// {
								// 		"id": 87,
								// 		"from": 2,
								// 		"to": 1,
								// 		"text": "dhsdsgdsg",
								// 		"time": 542453345,
								// 		"read": 0
								// },
						$("body").append("<audio src=\"ding.m4a\" autoplay></audio>")
						get_encryption_key(data.from, function(key) {
							let encryption_key = CryptoJS.SHA256(key).toString(); 
      						let message = CryptoJS.AES.decrypt(data.text, encryption_key).toString(CryptoJS.enc.Utf8);
							history_storage.add_message(data.from, {
								id: data.id,
								from: data.from,
								to: chat.my_id,
								text: message,
								time: data.time,
								read: "0"
							})
							if ($('.contact.select').attr("id") == data.from || $('.contact.select').attr("id") == data.to) {
								chat.upd_draw_history($('.contact.select').attr("id"))
								PiApi.read($('.contact.select').attr("id"), function() {
									history_storage.set_read($('.contact.select').attr("id"))
								})
							}
						})

						contact_cache.set_last_message(data.from, {
							text: data.text,
							time: data.time
						})

						chat.draw_contacts(contact_cache.get());

					}, function(state, user_id, ls) { // Какой-то контакт олнайн или оффлайн

						if (state) {
							contact_cache.set_online(user_id)
						} else {
							contact_cache.set_offline(user_id)
							contact_cache.set_last_seen(user_id, ls)
						}

					}, function(user_id) { // Сообщение прочитано
						console.log("Чтение")
						if (history_storage.is_data(user_id)) {
							history_storage.set_read(user_id)
							if ($('.contact.select').attr("id") == user_id) {
								chat.upd_draw_history($('.contact.select').attr("id"))
							}
						}

					}, function() { // Запуск с начала

						PiApi.get_contacts(function(data) {
							chat.draw_contacts(data);
							contact_cache.set(data);
						})
						PiApi.get_history($('.contact.select').attr("id"), function(data) {
							chat.draw_message(data.messages);
						})

					})

				})
			})
			$(".chat").html("<div class='msg_desc'>");
			PiApi.get_me(function(me) {
				$(".msg_desc").append('<img style="height: 32px;width: 32px;" src="' + me.avatar + '" alt=""><br>'); 
				$(".msg_desc").append("Hello, <b>" + me.name + " " + me.last_name + "</b>!<br>We are happy to see you in <b>PiChat</b>!<br>");
				$(".msg_desc").append("To start messanging select contact from left menu or try find your friend by searching input. If his/her not have <b>username</b> type something such as <b>name</b>, <b>last name</b>  or <b>email</b>");
			})
			$(".chat").append("</div>");
			$("#search").focus(function() {
				chat.search_window = true;
				$(".leftMenu").html("\
					<div class=\"findTitle\">\
						<div class=\"text\">User find:</div>\
						<div class=\"findClose\"> <i class=\"small material-icons\">close</i></div>\
					</div>\
					<div class=\"find_result\"></div>\
				")
				$(".findTitle > .findClose").click(function() {
					chat.search_window = false;
					chat.draw_contacts(contact_cache.get());
					$("#search").val("");
				})
				$("#search").on("input", function() {
					PiApi.search($("#search").val(), function(data) {
						chat.draw_search(data)
					})
				})
			})

			// Скрываем кнопочки
			$(".info > .edit_buttons").css("display", "none")

			// Демон для вывода онлайна

			setInterval(function() {
				chat.setState()
			}, 500)
		} else {
			$("#search").hide();
			$('.content').html("\
				<div class=\"auth\">\
					<div class=\"authForm z-depth-1\">\
						<div class=\"title\">Auth with Google</div>\
						<meta name=\"google-signin-scope\" content=\"profile email\">\
						<meta name=\"google-signin-client_id\" content=\"388612908476-e469uovv30imr68107m248jrsgekb07m.apps.googleusercontent.com\">\
						<script src=\"https://apis.google.com/js/platform.js\" async defer><\/script>\
						<div class=\"g-signin2 z-depth-1\" data-onsuccess=\"google_auth\"><\/div>\
					</div>\
				</div>\
			");
		}
	},
	setState: function() {
		let sel_id = parseInt($('.contact.select').attr("id"))
		if (contact_cache.is_online(sel_id)) {
			$(".header > .info > .last_seen").html("<font color=\"green\">Online</font>")
		} else {
			$(".header > .info > .last_seen").html(beauty_lastseen(contact_cache.get_last_seen(sel_id)))
		}

		if (sel_id == chat.my_id) {
			$(".header > .info > .last_seen").html("<font color=\"black\">Your personal storage</font>")
		}
	},
	send: function() {
		let msg = $("input[name=msg_input]").val();
        let us_id = $('.contact.select').attr("id");
        get_encryption_key(us_id, function(key) {
        	let encryption_key = CryptoJS.SHA256(key).toString();
			let encrypt_msg = CryptoJS.AES.encrypt(msg, encryption_key).toString();
        	PiApi.send(us_id, encrypt_msg, function(data) {
        		// {
					// "id": 87,
					// "from": 2,
					// "to": 1,
					// "text": "dhsdsgdsg",
					// "time": 542453345,
					// "read": 0
				// },
        		history_storage.add_message(data.to, {
        			id: data.id,
        			from: chat.my_id,
        			to: data.to,
        			text: msg,
        			time: data.time,
        			read: data.read,
        		})
        		contact_cache.set_last_message(data.to, {
					text: msg,
					time: data.time
				})
				chat.draw_contacts(contact_cache.get());
				chat.upd_draw_history(us_id)
        	})
        })
        chat.add_message({
			"id": 0,
			"from": chat.my_id,
			"to": us_id,
			"text": msg,
			"time": Date.now(),
			"read": 0
		})
        $("input[name=msg_input]").val("");
	},
	right_scroll: function() {
		document.getElementsByClassName("chat")[0].scrollTop = document.getElementsByClassName("chat")[0].scrollHeight;
	},
	login_suc: function(access_key, id) {
	    document.cookie = "key=" + access_key;
	    document.cookie = "id=" + id;
	    chat.my_id = 0;
	    this.start();
	},
	draw_contacts: function(contacts) {
		if (!chat.search_window) {
			result = "";
			var select_id = "";
			if ($('.contact').length > 0) {
			    select_id = $('.contact.select').attr("id");
			}
			contacts.sort(function(a, b) {
				if (a.last_message.time < b.last_message.time) return 1;
				if (a.last_message.time > b.last_message.time) return -1;
			})
			console.log("Отрисовка контактов")
			console.log(contacts)
			for(i in contacts) {
				let contact = contacts[i];
				console.log(contact)
				result += '<div class="contact waves-effect waves-light" id="' + contact["user_id"] + '">';
				result += '	<img src="' + (contact.user_id == chat.my_id ? "https://olegdanilov604.xyz/PiChat/user/avatars/favorite.png" : contact["avatar"]) + '"' + (contact.user_id == chat.my_id ? " style='border-radius: 0px;'" : '') + ' class="avatar info">';
				result += '	<div class="info name_last">';
				result += '		<div class="name">' + (contact.user_id == chat.my_id ? "Saved Messages" : (contact["name"] + ' ' + contact["last_name"])) + '</div>';
				result += '		<div class="last_message"></div>';
				result += '	</div>';
				result += '	<div class="info date_unread">';
				var time = new Date(contact.last_message.time * 1000);
				result += '		<div class="date">' + (time.getDate() == new Date().getDate() ? (time.getHours() <= 9 ? "0" + time.getHours() : time.getHours()) + ":" + (time.getMinutes() <= 9 ? "0" + time.getMinutes() : time.getMinutes()) : (time.getDate() <= 9 ? "0" + time.getDate() : time.getDate()) + "." +  (time.getMonth() <= 9 ? "0" + time.getMonth() : time.getMonth())) + '</div>';
				result += '		<div class="unread"' + (contact.unread_messages <= 0 ? ' style="display: none;"' : "") + '">' + (contact.unread_messages > 0 ? contact.unread_messages : "") + '</div>'; 
				result += '	</div>';
				result += '</div>';
			}

			$(".leftMenu").html(result);
			// Защита от XSS
			for (let i in contacts) {
				$(".contact#" + contacts[i].user_id + " > .info.name_last > .last_message")[0].innerText = (contacts[i].last_message.user_id == chat.my_id ? "You: " : "") + contacts[i].last_message.text
			}

			if (select_id) {
			    $(".contact#" + select_id).addClass('select');
			    // chat.draw_message(select_id);
			    $('.header .info .name').html($('.contact.select .info .name').html());
			    chat.right_scroll();
			}

			// Клик по контакту
			$('.contact').click(function() {
				let this_id = this.id
				$('.contact').removeClass('select');
				$(this).addClass('select');

				// Отображаем статус
				chat.setState()

				// Отрисовываем переписку
				chat.upd_draw_history(this.id)


				if (chat.is_mobile) {
					chat.open_msgarea()
				}
				

				$('.header .info .name').html($('.contact.select .info .name').html());
				chat.right_scroll();
			});
			// Укорачиваем сообщения
			$(".contact .last_message").each(function(i, elem) {
				let is_changed = false
				while(parseInt($(elem).css("height")) > 19) {
					is_changed = true
					let text = $(elem).html()
					$(elem).html(text.substr(0, text.length - 1))
				}
				if (is_changed) {
					let text = $(elem).html()
					$(elem).html(text.substr(0, text.length - 3) + "...")
				}
			})
		}
	},
	draw_search: function(sres) {

		result = "";
		for(i in sres) {
			contact = sres[i];
			result += '<div class="contact waves-effect waves-dark" id="' + contact["user_id"] + '">';
			result += '	<img src="' + contact["avatar"] + '" class="avatar info">';
			result += '	<div class="info name_last">';
			result += '		<div class="name">' + (contact["name"] + ' ' + contact["last_name"]) + '</div>';
			result += '		<div class="last_message">' + contact.username + '</div>';
			result += '	</div>';
			result += '	<div class="info date_unread">';
			// var time = new Date(contact.last_message.time * 1000);
			// result += '		<div class="date">' + (time.getDate() == new Date().getDate() ? (time.getHours() <= 9 ? "0" + time.getHours() : time.getHours()) + ":" + (time.getMinutes() <= 9 ? "0" + time.getMinutes() : time.getMinutes()) : (time.getDate() <= 9 ? "0" + time.getDate() : time.getDate()) + "." +  (time.getMonth() <= 9 ? "0" + time.getMonth() : time.getMonth())) + '</div>';
			// result += '		<div class="unread">' + contact.unread_messages + '</div>'; 
			result += '	</div>';
			result += '</div>';
		}
		$(".find_result").html(result);
		$(".find_result > .contact").click(function() {
			$('.contact').removeClass('select');
			$(this).addClass('select');

			chat.upd_draw_history(this.id)

			if (contact_cache.is_online(this.id)) {
				$(".header > .info > .last_seen").html("<font color=\"green\">Online</font>")
			} else {
				$(".header > .info > .last_seen").html("Offline")
			}
			$('.header .info .name').html($('.contact.select .info .name').html());
			chat.right_scroll();
		})
	},
	draw_message: function(history) {
		var result = "",
			msgs;
		// for (var i = 0; i < chat.contact_list.length;i++) {
			// if (chat.contact_list[i]["id"] == id) {
				// msgs = chat.contact_list[i]["history"];
			// }
		// }
		// {
			// "id": 87,
			// "from": 2,
			// "to": 1,
			// "text": "dhsdsgdsg",
			// "time": 542453345,
			// "read": 0
		// },
		let is_unread = false;
		from = 0;
		for (i in history) {
			let msg = history[i];
			if (msg.read == "0" && msg["from"] != chat.my_id) {
				is_unread = true;
				from = msg["from"];
			}
			result += '<div class="msg_cont"><div msgid="' + msg.id + '" class="message' + (msg["from"] == chat.my_id ? " my" : "") + '">';
			result += '	<div class="text">'
			// result += msg['text'];
			result += '	</div>'
			result += '	<div class="time">'
			var time = new Date(msg['time'] * 1000);
			result += '		<div class="date">' + (time.getDate() == new Date().getDate() ? (time.getHours() <= 9 ? "0" + time.getHours() : time.getHours()) + ":" + (time.getMinutes() <= 9 ? "0" + time.getMinutes() : time.getMinutes()) : (time.getDate() <= 9 ? "0" + time.getDate() : time.getDate()) + "." +  (time.getMonth() <= 9 ? "0" + time.getMonth() : time.getMonth())) + '</div>';
			result += '	</div>'
			result += '	<div class="status' + (msg["from"] == chat.my_id ? (msg['read'] == "1" ? " read" : " send") : "") + '"></div>'
			result += '</div></div>'
		}
		if (is_unread) {
			PiApi.read(from, function(data) {
				if (data) {
					// Еху!!
				}
			})
		}
		$(".chat").html(result);

		for (let i in history) {
			$(".chat .message[msgid=" + history[i].id + "] > .text")[0].innerText = history[i].text
		}

				
		$(".message .text").each(function(i, elem) {
			if ($(elem).html().length > 1) {
				h = $(elem).css("height")
				while($(elem).css("height") == h) {
					$(elem).css("width", parseInt($(elem).css("width")) - 1)
				}
				$(elem).css("width", parseInt($(elem).css("width")) + 2)
		    }
		})

		// Выделение сообщений

		let select_message = function(elem) {
			// ev.preventDefault()
			$(elem).addClass("msg-select")
			// $(elem).unbind("dblclick")
			// $(elem).dblclick(unselect_message)
			chat.show_edit_buttons()
			chat.msg_selecting = true;
		}
		let unselect_message = function(elem) {
			$(elem).removeClass("msg-select")
			// $(elem).unbind("dblclick")
			// $(elem).dblclick(select_message)
			if (!$(".msg-select").length > 0) { // Если больше выделенных сообщений не осталось то прячем кнопки
				chat.hide_edit_buttons()
				chat.msg_selecting = false;
			}
		}
		$(".msg_cont").mousedown(function(ev) {
			let first_sel = this
			let is_unselecting = $(this).hasClass("msg-select")
			this.select_start_pos = ev.clientY
			$(window).on("mouseup", function() {
				$(first_sel).unbind("mouseup")
				// $(this).unbind("mousemove")
				$(".msg_cont").unbind("mouseout")
				$(".msg_cont").unbind("mousemove")
			})

			$(".msg_cont").mousemove(function() {
				if (is_unselecting) {
					unselect_message(this)
				} else {
					select_message(this)
				}
			})

			$(".msg_cont").mouseout(function(ev) {
				if (first_sel.select_start_pos < ev.clientY && this.getBoundingClientRect().y > ev.clientY) {
					unselect_message(this)
				} else if (first_sel.select_start_pos > ev.clientY && this.getBoundingClientRect().y < ev.clientY) {
					unselect_message(this)
				}
			})

			$(this).unbind("mousemove")
			$(this).unbind("mouseout")

			$(this).mousemove(function(ev) {
				if (Math.abs(this.select_start_pos - ev.clientY) > 10) {
					if (is_unselecting) {
						unselect_message(this)
					} else {
						select_message(this)
					}
				} else {
					unselect_message(this)
				}
			})
		})

		$(".msg_cont").click(function() {
			if (chat.msg_selecting) {
				if ($(this).hasClass("msg-select")) {
					unselect_message(this)
				} else {
					if (is_unselecting) {
						unselect_message(this)
					} else {
						select_message(this)
					}
				}
			}
		})

		// Конец выделения сообщений

		this.right_scroll()
	},
	add_message: function(msg) {
		var result = ""
		result += '<div class="msg_cont"><div class="message' + (msg["from"] == chat.my_id ? " my" : "") + '">'
		result += '	<div class="text addtext">';
		// result += msg['text'];
		result += '	</div>'
		result += '	<div class="time">'
		var time = new Date(msg['time'] * 1000);
		result += '		<div class="date">' + (time.getDate() == new Date().getDate() ? (time.getHours() <= 9 ? "0" + time.getHours() : time.getHours()) + ":" + (time.getMinutes() <= 9 ? "0" + time.getMinutes() : time.getMinutes()) : (time.getDate() <= 9 ? "0" + time.getDate() : time.getDate()) + "." +  (time.getMonth() <= 9 ? "0" + time.getMonth() : time.getMonth())) + '</div>';
		result += '	</div>'
		result += '	<div class="status sending"></div>'
		result += '</div></div>'
		$(".chat").append(result);

		// Защита от XSS
		$(".text.addtext")[0].innerText = msg['text']
		$(".text.addtext").removeClass("addtext")

		this.right_scroll()
	},
	get_key: function() {
		return getCookie("key");
	},
	is_logged: function() {
		return getCookie("key") ? true : false 					
	},
	show_edit_buttons: function() {
		$(".header > .info > .name").css("display", "none")
		$(".header > .info > .last_seen").css("display", "none")
		$(".header > .info > .edit_buttons").css("display", "")
	},
	hide_edit_buttons: function() {
		$(".header > .info > .name").css("display", "")
		$(".header > .info > .last_seen").css("display", "")
		$(".header > .info > .edit_buttons").css("display", "none")
	},
	upd_draw_history: function(user_id) {
		if (history_storage.is_data(user_id)) {
			chat.draw_message(history_storage.get_data(user_id));
		} else {
			$(".chat").html("\
				<div class=\"msg_preloader\">\
				  <div class=\"preloader-wrapper active\">\
  					  <div class=\"spinner-layer spinner-green-only\">\
  					    <div class=\"circle-clipper left\">\
  					      <div class=\"circle\"></div>\
  					    </div><div class=\"gap-patch\">\
  					      <div class=\"circle\"></div>\
  					    </div><div class=\"circle-clipper right\">\
  					      <div class=\"circle\"></div>\
  					    </div>\
  					  </div>\
  					</div>\
  				</div>\
  			")
			PiApi.get_history(user_id, function(data) {
				chat.draw_message(data.messages);
				history_storage.set_data(user_id, data.messages)
			})
		}
	},
	is_mobile: false,
	enterMobile: function() {
		if (!this.is_mobile) {
			this.is_mobile = true;
		}
	},
	exitMobile: function() {
		if (this.is_mobile) {
			this.is_mobile = false;
		}
	},
	open_msgarea: function() {
		$(".msgArea").show()
		$(".leftMenu").hide()
		$(".left-button > .back").show()
		$(".left-button > .menu").hide()
		$(".find").hide()
		$(".left-button > .back").unbind("touchend")
		$(".left-button > .back").on("touchend", function() {
			chat.open_chats()
			setTimeout(function(){
				chat.search_window = false;
				chat.draw_contacts(contact_cache.get());
				$("#search").blur()
			},100);
		}).click(function() {
			chat.open_chats()
			setTimeout(function(){
				chat.search_window = false;
				chat.draw_contacts(contact_cache.get());
				$("#search").blur()
			},100);
		})
	},
	open_chats: function() {
		$(".left-button > .back").hide()
		$(".left-button > .menu").show()
		$(".msgArea").hide()
		$(".leftMenu").show()
		$(".find").show()
		$(".name").html("")
		$(".last_seen").html("")
		$("#search").val("")
	}
};

// Нужно:
// Хранить все истории сообщений тут что-бы не подгружать их с сервера
// Хранить все контакты

history_storage = {
	storage: [], // {user_id:1, history: [...]}
	get_data: function(user_id) { // Получении истории определённого пользователя
		let res = []
		for (var s in this.storage) {
			if (this.storage[s].user_id === parseInt(user_id)) {
				res = this.storage[s].history
				break;
			}
		}
		return res;
	},
	get_index: function(user_id) { // Получения индекса истории определённого пользователя в storage
		let res = 0;
		for (var s in this.storage) {
			if (this.storage[s].user_id === parseInt(user_id)) {
				res = s;
				break;
			}
		}
		return res;
	},
	is_data: function(user_id) { // Проверка наличия истории определённого пользователя в storage
		let res = false;
		for (var s in this.storage) {
			if (this.storage[s].user_id === parseInt(user_id)) {
				res = true;
				break;
			}
		}
		return res;
	},
	set_data: function(user_id, history) { // Перезапись всей истории определённого пользователя (нужно для полного обновления данных)
		// Сначала найдём есть ли данные уже что-бы не допустить добавления истории одного пользователя два раза
		if (this.is_data(user_id)) { // Если есть - удаляем нахуй
			this.storage.splice(this.get_index(user_id), 1)
		}
		console.log("Добавление истории " + user_id)
		this.storage[this.storage.length] = { // Добавляем обновлённые данные
			user_id: parseInt(user_id),
			history: history
		}
	}, 
	add_message: function(user_id, message) {
		if (this.is_data(user_id)) {
			let ind = this.get_index(user_id)
			this.storage[ind].history[this.storage[ind].history.length] = message
		}
	},
	set_read: function(user_id) {
		let ind = this.get_index(user_id)
		for (let i in this.storage[ind].history) {
			let msg = this.storage[ind].history[i]
			if (msg.from == chat.my_id) {
				this.storage[ind].history[i].read = "1"
			}
		}
	}
}


function google_auth(googleUser) {
	PiApi.auth(googleUser)
}
enc_key_cache = {}
function get_encryption_key(user_id, callback) {
	var key = getCookie('key');
	if (enc_key_cache[user_id]) { 
		callback(enc_key_cache[user_id])
	} else { 
		$.ajax({
			url: "https://olegdanilov604.xyz/PiChat/messages/encryption_keys.php",
			type: "GET",
			data: {
				key: key,
				user_id: user_id
			},
			success: function(data) {
				if (data.success) { 
					enc_key_cache[user_id] = data.encryption_key;
					callback(data.encryption_key)
				} else {
					Materialize.toast('No encryption key!', 1000, 'rounded');
				}
			}
		});
	}
}

// Проверка видимоти окна

var vis = (function(){
    var stateKey, eventKey, keys = {
        hidden: "visibilitychange",
        webkitHidden: "webkitvisibilitychange",
        mozHidden: "mozvisibilitychange",
        msHidden: "msvisibilitychange"
    };
    for (stateKey in keys) {
        if (stateKey in document) {
            eventKey = keys[stateKey];
            break;
        }
    }
    return function(c) {
        if (c) document.addEventListener(eventKey, c);
        return !document[stateKey];
    }
})();


	chat.start();

contact_cache = {
	// Format:
	// "user_id", "name", "last_name", "last_message", "avatar", "online", "last_seen"
	cache: [],
	set: function(contacts) {
		// contacts.state = 0;
		// 0 - Ничего не происходит
		// 1 - Печатает сообщение
		// 2 - А хуй его знает, потом придумаю
		this.cache = contacts
	},
	get: function() {
		return this.cache
	},
	get_index: function(user_id) {
		for (let i in this.cache) {
			if (this.cache[i].user_id == user_id) {
				return i;
			}
		}
	},
	set_last_seen: function(user_id, time) {
		let ind = this.get_index(user_id)
		this.cache[ind].last_seen = time
	},
	get_last_seen: function(user_id) {
		let ind = this.get_index(user_id)
		return this.cache[ind].last_seen
	},
	set_online: function(user_id) {
		let ind = this.get_index(user_id)
		this.cache[ind].online = true
	},
	set_offline: function(user_id) {
		let ind = this.get_index(user_id)
		this.cache[ind].online = false
	},
	is_online: function(user_id) {
		let ind = this.get_index(user_id)
		return this.cache[ind].online
	},
	set_last_message: function(user_id, msg) {
		let ind = this.get_index(user_id)
		this.cache[ind].last_message = {
			text: msg.text,
			time: msg.time,
			read: "0"
		}
	}
}

$(document).ready(function() {
	UI = {
		modal: function(header, text, btn1, btn2, callback1, callback2, width, height) {
			$("#modal1 h5").html(header);
			$("#modal1 p").html(text);
			$(".btn1").html(btn1);
			$(".btn2").html(btn2);
			$(".btn1").click(callback1);
			$(".btn2").click(callback2);
			$('.modal').modal();
			$('#modal1').modal('open');
			if (width != "") {
				$("#modal1").css("width", width);
				$("#modal1").css("height", height);
			}
		}
	}
})


function beauty_lastseen(timestamp) {
	let time = new Date(timestamp * 1000)
	let now = new Date()
	if (((now - time) < 15000)) { // Меньше 15 секунд
		return "Last seen just now"
	} else if (((now - time) < 60000)) { // Меньше минуты
		// return "Last seen about " + ~~((now - time) / 1000) + " seconds ago"
		// Секунды не оч выглядят
		return "Last seen just now"
	} else if ((now - time) < 3600000) { // Меньше часа
		return "Last seen about " + ~~((now - time) / 60000) + " minutes ago"
	} else if ((now - time) < 28800000) { // Меньше 8 часов 
		return "Last seen about " + ~~((now - time) / 3600000) + " hours ago"
	} else if ((now - time) < 86400000) { // Меньше суток
		return "Last seen at " + (time.getHours() + ":" + ((time.getMinutes() < 9) ? ("0" + time.getMinutes()) : (time.getMinutes())))
	} else if ((now - time) < 172800000) { // Меньше двух суток
		return "Last seen yesterday at " + (time.getHours() + ":" + ((time.getMinutes() < 9) ? ("0" + time.getMinutes()) : (time.getMinutes())))
	} else {
		var formatter = new Intl.DateTimeFormat("en-EN", {
			// hour12: true,
			year: "numeric",
			month: "short",
			day: "2-digit"
		});
		// {month: "short", hour12: true, day: "2-digit", year: "2-digit", hour: undefined, minute: undefined, secound: undefined}
		return "Last seen " + (formatter.format(time)) + " at " + (time.getHours() + ":" + ((time.getMinutes() < 9) ? ("0" + time.getMinutes()) : (time.getMinutes())))
	}
}
function timeConverter(UNIX_timestamp){
  var a = new Date(UNIX_timestamp * 1000);
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var year = a.getFullYear();
  var month = months[a.getMonth()];
  var date = a.getDate();
  var hour = a.getHours();
  var min = a.getMinutes();
  var sec = a.getSeconds();
  var time = date + ' ' + month + ' ' + year + ' ' + hour + ':' + min + ':' + sec ;
  return time;
}
function getOs(c){var c=c.toLowerCase();var b="Unknown OS Platform";match=["windows nt 10","windows nt 6.3","windows nt 6.2","windows nt 6.1","windows nt 6.0","windows nt 5.2","windows nt 5.1","windows xp","windows nt 5.0","windows me","win98","win95","win16","macintosh","mac os x","mac_powerpc","android","linux","ubuntu","iphone","ipod","ipad","blackberry","webos"];result=["Windows 10","Windows 8.1","Windows 8","Windows 7","Windows Vista","Windows Server 2003/XP x64","Windows XP","Windows XP","Windows 2000","Windows ME","Windows 98","Windows 95","Windows 3.11","Mac OS X","Mac OS X","Mac OS 9","Android","Linux","Ubuntu","iPhone","iPod","iPad","BlackBerry","Mobile"];for(var a=0;a<match.length;a++){if(c.indexOf(match[a])!==-1){b=result[a];break}}return b};
function identifyBrowser(g,f){var c={Chrome:[/Chrome\/(\S+)/],Firefox:[/Firefox\/(\S+)/],MSIE:[/MSIE (\S+);/],Opera:[/Opera\/.*?Version\/(\S+)/,/Opera\/(\S+)/],Safari:[/Version\/(\S+).*?Safari\//]},e,a,d,b;if(g===undefined){g=navigator.userAgent}if(f===undefined){f=2}else{if(f===0){f=1337}}for(d in c){while(e=c[d].shift()){if(a=g.match(e)){b=(a[1].match(new RegExp("[^.]+(?:.[^.]+){0,"+ --f+"}")))[0];return d+" "+b}}}return null};
$(document).ready(function(){
	$(".sess_list i").click(function() {
		sessions();
		function sessions() {
			PiApi.get_sessions(function(data) {
				var text = "<table style='user-select:none;' class='striped'><tr><th>Started</th><th>Last active</th><th>Os</th><th>Browser</th><th>Ip</th></tr>";
				for (var i = 0; i < data.sessions.length; i++) {
					text += "<tr><td>" + beauty_lastseen(data.sessions[i].started).replace("Last seen ", "") + "</td>";
					text += "<td>" + beauty_lastseen(data.sessions[i].time).replace("Last seen ", "") + "</td>";
					text += "<td>" + getOs(data.sessions[i].user_agent) + "</td>";
					text += "<td>" + identifyBrowser(data.sessions[i].user_agent) + "</td>";
					text += "<td>" + data.sessions[i].ip + "</td>";
					text += "</tr>"; 
				}
				text += "</table>";
				UI.modal("Your active sessions", text, "Terminate all", "ОK", function() {
					PiApi.terminate_sessions(0, function() {
						Materialize.toast('All sessions except current were terminated', 5000, 'rounded');
					});
				},
				function() {
					//beauty_lastseen
				});
			});
		}
	});
	$(".exit").click(function() {
		document.cookie = "key=";
		document.cookie = "G_AUTHUSER_H=";
		document.cookie = "G_ENABLED_IDPS=";
		location.reload(true);
	});
	$(".settings").click(function() {
		PiApi.get_me(function(data) {
			var text = "";
			var username = data.username;
			var avatar = data.avatar;
			var name = data.name;
			var last_name = data.last_name;
			var bio = data.bio;
			text += "<img style='width:48px;height:48px;' src='" + avatar + "'><br>";
			text += "<a href='#' class='settings_name'>" +  name + " " + last_name + "</a><br>";
			text += "Username: @<a href='#' class='change_username'>" + username + "</a><br>";
			text += "Bio: <a href='#' class='change_bio'>" + bio + "</a><br>";
			text += "<br><div class='divider'></div><br>";
			text += "<div class='switch'><label>Use auto-lock passcode<input type='checkbox'> <span class='lever'></span></label> </div>";
			text += "<br><div class='divider'></div><br>";
			text += "<div class='switch'><label>Always use end-to-end encryption<input type='checkbox'> <span class='lever'></span></label> </div>";

			UI.modal("Settings", text, "", "ОK", function() {
					//
				},
				function() {
					//
				},
				"300px", "550px"
			);
			$(".change_username").click(function() {
				var text = "";
				text += '<div class="input-field col s6">';
				text += '<input maxlenght="32" id="username" type="text">';
				text += '<label for="username">@username (a-Z, 3-32)</label><br>You can chose username on PiChat. Other people will can find you.';
				UI.modal("Username", text, "Cancel", "Save", function() {
						//
					},
					function() {
						$.ajax({
							url: PiApi.origin + "user/settings.php",
							type: "GET",
							data: {
								key: getCookie('key'),
								username: $("#username").val()
							},
							success: function(data) {
								if (data.success) {
									Materialize.toast('Username was changed', 5000, 'rounded');
								} else {
									Materialize.toast(data.message, 5000, 'rounded');
								}
							}
						})
					},
					"280px", "350px"
				);
			});
			$(".settings_name").click(function() {
				var text = "";
				text += '<div class="input-field col s6">';
				text += '<input maxlenght="32" id="name" placeholder="" value="' + name + '" type="text"><label class="active" for="name">First Name</label>';
				text += '<div class="input-field col s6">';
				text += '<input maxlenght="32" id="last_name" placeholder="" value="' + last_name + '" type="text"><label class="active" for="last_name">Last Name</label>';
				UI.modal("Change your name", text, "Cancel", "Save", function() {
						//
					},
					function() {
						$.ajax({
							url: PiApi.origin + "user/settings.php",
							type: "GET",
							data: {
								key: getCookie('key'),
								name: $("#name").val(),
								last_name: $("#last_name").val()
							},
							success: function(data) {
								if (data.success) {
									Materialize.toast('Name/Last name was changed', 5000, 'rounded');
								} else {
									Materialize.toast(data.message, 5000, 'rounded');
								}
							}
						})
					},
					"300px", "350px"
				);
			});
			$(".change_bio").click(function() {
				var text = "";
				text += '<div class="input-field col s6">';
				text += '<input maxlenght="70" id="bio" placeholder="" value="' + bio + '" type="text"><label class="active" for="name">Bio</label><br>You can write few words about you.';
				UI.modal("Edit your bio", text, "Cancel", "Save", function() {
						//
					},
					function() {
						$.ajax({
							url: PiApi.origin + "user/settings.php",
							type: "GET",
							data: {
								key: getCookie('key'),
								bio: $("#bio").val()
							},
							success: function(data) {
								if (!data.success) {
									Materialize.toast(data.message, 5000, 'rounded');
								}
							}
						})
					},
					"250px", "300px"
				);
			});
		});
	});
});
        
