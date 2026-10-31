(function (root, factory) {
  const catalog = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
  if (root) root.MINEFALL_COSMETIC_CATALOG = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const arenaNumbers = {
    standard: ['#2459b4','#14764f','#bd3434','#4b448f','#91382c','#127d83','#1f2a35','#59646b'],
    lava: ['#1757a7','#145f38','#b51e28','#623a9e','#8b361b','#00666d','#291c20','#66514a'],
    neon: ['#174db8','#087c57','#c32655','#5833a8','#9b3e17','#007e92','#22274d','#515b89'],
    frost: ['#2457a6','#176c54','#b92f43','#5647a8','#914c27','#087a83','#263b4b','#657782'],
    forest: ['#154fb0','#106745','#b02d31','#5d3aa1','#87451d','#08706b','#20342a','#566b5c'],
    sunset: ['#1c4fa8','#146642','#b92743','#6440ad','#914614','#08768a','#352436','#6c5c61'],
    ocean: ['#174fae','#087b5b','#c12f3c','#5644ac','#934623','#00758a','#173248','#5d6c79'],
    toxic: ['#214f9f','#26751e','#b22a38','#563f9c','#85441b','#007a6d','#28351c','#59694a'],
    void: ['#3154bf','#26745b','#c03259','#8750c7','#a34b2a','#008b9d','#241c39','#655a80'],
    sand: ['#245bb7','#27714d','#bd3535','#6245a7','#9a4b1b','#087b83','#383326','#786d5b'],
    rose: ['#2858b9','#187257','#c02346','#7b43a2','#9a4b28','#087b87','#392539','#746071'],
    cyber: ['#085cb9','#087a70','#c33147','#6244c7','#a94d22','#007d9b','#132b3d','#526b86']
  };
  const makeArena = (id, title, emoji, price, desc, numberColors, defaultOwned, defaultEquipped) => ({ id, category: 'arena', title, emoji, price, desc, preview: id, numberColors, ...(defaultOwned ? { defaultOwned: true } : {}), ...(defaultEquipped ? { defaultEquipped: true } : {}) });
  const item = (category, id, title, emoji, price, desc, extra = {}) => ({ category, id, title, emoji, price, desc, ...extra });
  return {
    arena: [
      makeArena('arena-standard','Sàn tiêu chuẩn','🟦',0,'Sàn đá mặc định cùng bảng màu số cổ điển.',arenaNumbers.standard,true,true),
      makeArena('arena-lava','Sàn dung nham','🌋',30,'Đá đỏ nóng, số có độ tương phản cao.',arenaNumbers.lava),
      makeArena('arena-neon','Sàn neon','✨',45,'Sàn điện tử xanh tím, số màu neon.',arenaNumbers.neon),
      makeArena('arena-frost','Sàn băng giá','❄️',40,'Băng xanh sáng và bảng số lạnh.',arenaNumbers.frost),
      makeArena('arena-forest','Rừng cổ đại','🌲',38,'Đá rêu xanh cùng số xanh ngọc và đất.',arenaNumbers.forest),
      makeArena('arena-sunset','Hoàng hôn','🌅',42,'Tông cam tím hoàng hôn, số đỏ và lam.',arenaNumbers.sunset),
      makeArena('arena-ocean','Đáy đại dương','🌊',35,'Sàn xanh sâu, số tương phản dưới biển.',arenaNumbers.ocean),
      makeArena('arena-toxic','Vùng độc hại','☢️',50,'Sàn xanh hóa chất cùng số cảnh báo.',arenaNumbers.toxic),
      makeArena('arena-void','Hư không','🌌',60,'Sàn tím đen và các số phát sáng.',arenaNumbers.void),
      makeArena('arena-sand','Sa mạc','🏜️',25,'Sàn cát vàng và số màu đá khoáng.',arenaNumbers.sand),
      makeArena('arena-rose','Cánh hoa hồng','🌸',48,'Sàn hồng tím dịu với số đậm dễ đọc.',arenaNumbers.rose),
      makeArena('arena-cyber','Cyberpunk','🧬',65,'Sàn công nghệ xanh điện và số tương phản.',arenaNumbers.cyber)
    ],
    skin: [
      item('skin','skin-classic','Thám hiểm cổ điển','🧑‍🚀',0,'Màu xanh ngọc mặc định.',{color:'#63e0d5',defaultOwned:true,defaultEquipped:true}),
      item('skin','skin-gold','Mạ vàng','🌟',30,'Thân nhân vật ánh vàng.',{color:'#ffc267'}),
      item('skin','skin-violet','Tĩnh điện tím','🟣',25,'Dáng tròn với ánh tím.',{color:'#9e8aff'}),
      item('skin','skin-crimson','Đỏ cảnh báo','🔴',25,'Màu đỏ nổi bật trên bàn cờ.',{color:'#ff7884'}),
      item('skin','skin-mint','Bạc hà','🟢',35,'Tông xanh bạc hà phát sáng.',{color:'#85dcad'})
    ],
    avatar: [
      item('avatar','avatar-cadet','Tân binh','🎮',0,'Avatar mặc định.',{defaultOwned:true,defaultEquipped:true}),
      item('avatar','avatar-fox','Cáo nhanh trí','🦊',12,'Một chiếc cáo tinh ranh.'),
      item('avatar','avatar-robot','Robot dò mìn','🤖',18,'Đúng nghề, đúng người.'),
      item('avatar','avatar-skull','Đầu lâu','💀',20,'Cho những pha đọc mìn táo bạo.'),
      item('avatar','avatar-astronaut','Phi hành gia','👨‍🚀',28,'Sẵn sàng đáp xuống bãi mìn.'),
      item('avatar','avatar-crown','Vương miện','👑',55,'Phong cách của người săn hạng nhất.')
    ],
    flag: [
      item('flag','flag-classic','Cờ chiến thuật','⚑',0,'Cờ chiến thuật cổ điển.',{defaultOwned:true,defaultEquipped:true,effect:'classic',asset:'flag-classic.svg'}),
      item('flag','flag-vietnam','Quốc kỳ Việt Nam','🇻🇳',0,'Lá cờ đỏ sao vàng. Miễn phí mở khóa.',{defaultOwned:true,effect:'vietnam',asset:'flag-vietnam.svg'}),
      item('flag','flag-pirate','Cờ hải tặc','🏴‍☠️',24,'Dành cho những cuộc thám hiểm nguy hiểm.',{effect:'pirate',asset:'flag-pirate.svg'}),
      item('flag','flag-racing','Cờ đua tốc độ','🏁',20,'Cờ caro dành cho tay chơi tốc độ.',{effect:'racing',asset:'flag-racing.svg'}),
      item('flag','flag-japan','Quốc kỳ Nhật Bản','🇯🇵',24,'Tông trắng đỏ tối giản.',{effect:'japan',asset:'flag-japan.svg'}),
      item('flag','flag-korea','Quốc kỳ Hàn Quốc','🇰🇷',24,'Biểu tượng thái cực.',{effect:'korea',asset:'flag-korea.svg'}),
      item('flag','flag-us','Quốc kỳ Hoa Kỳ','🇺🇸',28,'Sọc và sao cổ điển.',{effect:'us',asset:'flag-us.svg'}),
      item('flag','flag-uk','Quốc kỳ Vương quốc Anh','🇬🇧',28,'Cờ Union Jack.',{effect:'uk',asset:'flag-uk.svg'}),
      item('flag','flag-france','Quốc kỳ Pháp','🇫🇷',24,'Ba màu xanh, trắng, đỏ.',{effect:'france',asset:'flag-france.svg'}),
      item('flag','flag-brazil','Quốc kỳ Brazil','🇧🇷',28,'Xanh lá, vàng và xanh dương.',{effect:'brazil',asset:'flag-brazil.svg'})
    ],
    bomb: [
      item('bomb','bomb-standard','Bom tiêu chuẩn','💣',0,'Hình bom mặc định, hiệu ứng nổ cổ điển.',{effect:'standard',palette:['#ffd36b','#ff735f','#fff4d6','#ffb35b'],defaultOwned:true,defaultEquipped:true,asset:'bomb-standard.svg'}),
      item('bomb','bomb-fire','Bom dung nham','🔥',28,'Lõi lửa và vụ nổ nóng rực.',{effect:'fire',palette:['#ffef85','#ff7b2d','#ed2f26','#ffd0a0'],asset:'bomb-fire.svg'}),
      item('bomb','bomb-ice','Bom băng','❄️',28,'Vụ nổ băng giá xanh lạnh.',{effect:'ice',palette:['#e9ffff','#95eaff','#4ea8ff','#bdc8ff'],asset:'bomb-ice.svg'}),
      item('bomb','bomb-toxic','Bom độc','☢️',35,'Vụ nổ hóa chất xanh độc.',{effect:'toxic',palette:['#eaff5b','#81e64b','#31c77a','#c6ff88'],asset:'bomb-toxic.svg'}),
      item('bomb','bomb-lightning','Bom sét','⚡',38,'Tia điện giật sáng khi kích nổ.',{effect:'lightning',palette:['#fff8a6','#ffe049','#a7e8ff','#fff'],asset:'bomb-lightning.svg'}),
      item('bomb','bomb-void','Bom hư không','🌑',45,'Vụ nổ hút vào tâm tối.',{effect:'void',palette:['#1b1038','#754de2','#cda6ff','#6037a0'],asset:'bomb-void.svg'}),
      item('bomb','bomb-pixel','Bom pixel','👾',35,'Vụ nổ khối pixel kiểu arcade.',{effect:'pixel',palette:['#54ffaf','#5ce1ff','#ff66ca','#ffe566'],asset:'bomb-pixel.svg'}),
      item('bomb','bomb-cosmic','Bom vũ trụ','🌌',50,'Vụ nổ sao và bụi vũ trụ.',{effect:'cosmic',palette:['#91a7ff','#d3a4ff','#76f2ff','#fff'],asset:'bomb-cosmic.svg'}),
      item('bomb','bomb-confetti','Bom pháo giấy','🎉',40,'Vụ nổ vui nhộn nhiều màu.',{effect:'confetti',palette:['#ff6b8a','#ffd166','#65e5cf','#a78bfa'],asset:'bomb-confetti.svg'}),
      item('bomb','bomb-plasma','Bom plasma','🟣',55,'Lõi plasma tím với xung năng lượng.',{effect:'plasma',palette:['#f5b7ff','#bd72ff','#8164ff','#8efff6'],asset:'bomb-plasma.svg'})
    ],
    elimination: [
      item('elimination','elim-standard','Nổ tiêu chuẩn','💥',0,'Hiệu ứng loại mặc định.',{effect:'standard',defaultOwned:true,defaultEquipped:true}),
      item('elimination','elim-tombstone','Bia mộ RIP','🪦',25,'Bia mộ hiện lên tại vị trí bị loại.',{effect:'tombstone'}),
      item('elimination','elim-void','Bị hư không nuốt chửng','🌀',42,'Vòng xoáy tím khép lại quanh nhân vật.',{effect:'void'}),
      item('elimination','elim-stone','Hóa đá','🗿',30,'Nhân vật chuyển sang đá rồi vỡ vụn.',{effect:'stone'}),
      item('elimination','elim-pixel','Phân rã pixel','👾',38,'Nhân vật tan thành các khối pixel.',{effect:'pixel'}),
      item('elimination','elim-rocket','Phóng tên lửa','🚀',45,'Tên lửa đưa nhân vật bay khỏi bàn.',{effect:'rocket'}),
      item('elimination','elim-freeze','Đóng băng','🧊',30,'Băng kết tinh rồi vỡ ra.',{effect:'freeze'}),
      item('elimination','elim-lightning','Quá tải điện','⚡',38,'Xung điện chạy qua nhân vật.',{effect:'lightning'}),
      item('elimination','elim-shadow','Tan vào bóng tối','🌑',45,'Bóng tối hút nhân vật xuống.',{effect:'shadow'}),
      item('elimination','elim-burst','Bùng nổ ánh sáng','✨',35,'Một luồng sáng bật tung.',{effect:'burst'})
    ],
    trail: [
      item('trail','trail-dust','Bụi sao','✨',0,'Vệt bụi sáng ngắn sau mỗi bước.',{effect:'dust',defaultOwned:true,defaultEquipped:true}),
      item('trail','trail-ember','Vệt than hồng','🔥',22,'Tàn lửa rơi sau nhân vật.',{effect:'ember'}),
      item('trail','trail-frost','Dấu chân băng','❄️',22,'Tinh thể băng tan dần.',{effect:'frost'}),
      item('trail','trail-neon','Dải neon','💠',32,'Dải sáng neon xanh.',{effect:'neon'}),
      item('trail','trail-shadow','Bóng ma','🌑',32,'Bóng mờ lặp lại phía sau.',{effect:'shadow'}),
      item('trail','trail-rainbow','Cầu vồng','🌈',38,'Vệt sáng nhiều màu.',{effect:'rainbow'}),
      item('trail','trail-sakura','Cánh hoa anh đào','🌸',35,'Cánh hoa bay theo mỗi bước.',{effect:'sakura'}),
      item('trail','trail-circuit','Mạch điện','⚡',36,'Tia điện ngắn lóe trên đường đi.',{effect:'circuit'}),
      item('trail','trail-leaf','Lá xanh','🍃',28,'Những chiếc lá lướt qua sàn.',{effect:'leaf'}),
      item('trail','trail-cosmic','Bụi vũ trụ','🌟',45,'Hạt sao để lại quỹ đạo nhỏ.',{effect:'cosmic'})
    ],
    celebration: [
      item('celebration','celebration-confetti','Pháo giấy','🎉',0,'Pháo giấy nhiều màu mặc định.',{effect:'confetti',palette:['#ffd34e','#63e0d5','#ff687b','#a78bfa','#f8fbff','#82e6a7','#ffa65b'],defaultOwned:true,defaultEquipped:true}),
      item('celebration','celebration-fireworks','Pháo hoa','🎆',30,'Chùm pháo hoa nở trên màn thắng.',{effect:'fireworks',palette:['#fff18b','#ff79c6','#77eaff','#f5f7ff']}),
      item('celebration','celebration-coins','Mưa xu vàng','🪙',35,'Xu vàng rơi phủ màn hình.',{effect:'coins',palette:['#fff0a6','#ffd34e','#c58c21','#fff7d1']}),
      item('celebration','celebration-royal','Khải hoàn hoàng gia','👑',45,'Dải băng vàng và ánh vương miện.',{effect:'royal',palette:['#fff2a6','#ffd34e','#b87b1a','#fff']}),
      item('celebration','celebration-cosmic','Thăng hoa vũ trụ','🌌',55,'Bụi sao tím xanh lan khắp màn hình.',{effect:'cosmic',palette:['#a7a4ff','#dd8bff','#71efff','#f5f7ff']}),
      item('celebration','celebration-sakura','Mưa hoa anh đào','🌸',38,'Cánh hoa hồng rơi nhẹ.',{effect:'sakura',palette:['#ffc4dc','#ff8fb9','#fff1f7','#d69bff']}),
      item('celebration','celebration-lightning','Bão điện','⚡',42,'Các tia điện lóe sáng quanh banner.',{effect:'lightning',palette:['#fff7a6','#fff','#79d7ff','#7a8dff']}),
      item('celebration','celebration-neon','Neon rave','💫',48,'Ánh neon nhấp nháy nhiều lớp.',{effect:'neon',palette:['#4dffff','#ff5de4','#ae81ff','#faff72']}),
      item('celebration','celebration-prism','Lăng kính cầu vồng','🌈',42,'Các dải màu lăng kính xoay vòng.',{effect:'prism',palette:['#ff647c','#ffbd59','#fff47a','#5cf0a5','#55d8ff','#b98bff']}),
      item('celebration','celebration-pixel','Arcade 8-bit','👾',36,'Màn thắng kiểu arcade pixel.',{effect:'pixel',palette:['#54ffaf','#5ce1ff','#ff66ca','#ffe566'],asset:'bomb-pixel.svg'}),
      item('celebration','celebration-flames','Ngọn lửa chiến thắng','🔥',50,'Lửa vàng bùng lên bên dưới banner.',{effect:'flames',palette:['#fff2a6','#ffbd4a','#ff6d36','#e52c4f']})
    ]
  };
});
