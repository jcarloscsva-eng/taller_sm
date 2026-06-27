import { useState, useEffect } from "react";
import jsPDF from "jspdf";
import { db } from "./firebase";
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot
} from "firebase/firestore";

const C = {
  negro:"#0F0F0F",carbono:"#1A1A1A",plomo:"#2A2A2A",
  acento:"#FF6B00",acentoSuave:"#FF6B0015",
  texto:"#F0F0F0",textoSuave:"#888888",
  verde:"#22C55E",verdeClaro:"#22C55E20",
  azul:"#3B82F6",azulClaro:"#3B82F620",
  morado:"#A855F7",moradoClaro:"#A855F720",
  amarillo:"#F59E0B",amarilloClaro:"#F59E0B20",
  rojo:"#EF4444",rojoClaro:"#EF444420",
  borde:"#2F2F2F",
};

const fmtEur = n => isNaN(n)?"0,00 \u20ac":n.toFixed(2).replace(".",",")+"\u00a0\u20ac";
// Precio neto de una linea de albaran (precio * qty * (1 - dto%/100))
const lineaNeta = l => l.precio * (l.qty||1) * (1 - (parseFloat(l.dto)||0)/100);
const totalAlb  = ls => ls.reduce((s,l)=>s+lineaNeta(l),0);
const totalFac  = f  => f.servicios.reduce((s,l)=>s+l.precio,0);
// totalAlbConDto: total del albaran aplicando dto por linea Y dto global
const totalAlbConDto = (ls, dtoGlobal) => totalAlb(ls) * (1 - (parseFloat(dtoGlobal)||0)/100);

// ── DATOS ────────────────────────────────────────────────────────────────────
// DNI ficticios vinculados a cada cliente (para el portal)
const CLIENTES0 = [
  {id:1,nombre:"Maria Garcia", dni:"12345678A",tel:"612345678",visitas:8, gasto:1240,val:5,
   vehiculos:[{id:"v1a",modelo:"Seat Ibiza 2019",matricula:"4821KPL"},{id:"v1b",modelo:"Renault Megane 2015",matricula:"3312XYZ"}]},
  {id:2,nombre:"Juan Lopez",   dni:"23456789B",tel:"634567890",visitas:3, gasto:680, val:4,
   vehiculos:[{id:"v2a",modelo:"Ford Focus 2021",matricula:"9034MNQ"}]},
  {id:3,nombre:"Carlos Ruiz",  dni:"34567890C",tel:"678901234",visitas:12,gasto:2890,val:5,
   vehiculos:[{id:"v3a",modelo:"VW Golf 2017",matricula:"2209FRT"},{id:"v3b",modelo:"BMW Serie 1 2020",matricula:"6601ABC"}]},
  {id:4,nombre:"Ana Martin",   dni:"45678901D",tel:"645123456",visitas:5, gasto:920, val:3,
   vehiculos:[{id:"v4a",modelo:"Renault Clio 2020",matricula:"7712ABZ"}]},
  {id:5,nombre:"Pedro Sanchez",dni:"56789012E",tel:"689234567",visitas:2, gasto:340, val:null,
   vehiculos:[{id:"v5a",modelo:"Peugeot 308 2018",matricula:"5590CDF"},{id:"v5b",modelo:"Toyota RAV4 2022",matricula:"8823DEF"}]},
];
const CITAS0 = [
  {id:1,hora:"08:30",cliente:"Maria Garcia",  vehiculo:"Seat Ibiza 2019",   matricula:"4821KPL",servicio:"Cambio aceite + filtros",estado:"completada",     tel:"612345678",rec:"enviado"},
  {id:2,hora:"10:00",cliente:"Juan Lopez",    vehiculo:"Ford Focus 2021",    matricula:"9034MNQ",servicio:"Revision de frenos",    estado:"en_taller",      tel:"634567890",rec:"enviado"},
  {id:3,hora:"11:30",cliente:"Carlos Ruiz",   vehiculo:"VW Golf 2017",       matricula:"2209FRT",servicio:"ITV preparacion",       estado:"esperando_pieza",tel:"678901234",rec:"enviado"},
  {id:4,hora:"13:00",cliente:"Ana Martin",    vehiculo:"Renault Clio 2020",  matricula:"7712ABZ",servicio:"Cambio neumaticos",     estado:"esperando",      tel:"645123456",rec:"pendiente"},
  {id:5,hora:"16:00",cliente:"Pedro Sanchez", vehiculo:"Peugeot 308 2018",   matricula:"5590CDF",servicio:"Diagnostico averia",    estado:"confirmada",     tel:"689234567",rec:"pendiente"},
  {id:6,hora:"17:30",cliente:"Laura Torres",  vehiculo:"Toyota Corolla 2022",matricula:"1103XYZ",servicio:"Cambio bateria",        estado:"confirmada",     tel:"601876543",rec:"no_enviado"},
];
const REVISIONES = [
  {mat:"4821KPL",fecha:"hoy",         km:78400,srv:"Cambio aceite + filtros",   imp:128,mec:"Paco"},
  {mat:"4821KPL",fecha:"hace 6 meses",km:72100,srv:"Revision frenos + pastillas",imp:210,mec:"Paco"},
  {mat:"4821KPL",fecha:"hace 1 anyo", km:65800,srv:"Cambio neumaticos x4",      imp:380,mec:"Luis"},
  {mat:"9034MNQ",fecha:"hoy",         km:34200,srv:"Revision de frenos",         imp:290,mec:"Paco"},
  {mat:"9034MNQ",fecha:"hace 8 meses",km:28400,srv:"Cambio de aceite",           imp:89, mec:"Luis"},
  {mat:"2209FRT",fecha:"hace 1 mes",  km:91200,srv:"Revision completa",          imp:240,mec:"Paco"},
  {mat:"2209FRT",fecha:"hace 4 meses",km:87600,srv:"Cambio embrague",            imp:720,mec:"Paco"},
  {mat:"7712ABZ",fecha:"hace 3 meses",km:41500,srv:"ITV + reglaje luces",        imp:60, mec:"Luis"},
];
const FACTURAS0 = [
  {id:"F-2024-089",cliente:"Maria Garcia",servicios:[{id:1,desc:"Cambio aceite",precio:68},{id:2,desc:"Filtro aire",precio:24},{id:3,desc:"Mano obra",precio:36}],              estado:"pagada",   aviso:true},
  {id:"F-2024-088",cliente:"Roberto Vega",servicios:[{id:1,desc:"Reparacion suspension",precio:342},{id:2,desc:"Piezas",precio:90}],                                            estado:"pendiente",aviso:false},
  {id:"F-2024-087",cliente:"Elena Castro",servicios:[{id:1,desc:"Cambio embrague",precio:580},{id:2,desc:"Kit embrague",precio:140}],                                           estado:"pendiente",aviso:false},
  {id:"F-2024-086",cliente:"Carlos Ruiz", servicios:[{id:1,desc:"Revision completa",precio:180},{id:2,desc:"Filtros",precio:60}],                                               estado:"pagada",   aviso:true},
];
// dto: descuento % por linea
const ALBARANES0 = [
  {id:"ALB-001",cliente:"Juan Lopez", veh:"Ford Focus 2021",mat:"9034MNQ",mec:"Paco",fecha:"hoy 10:42",estado:"pendiente",dtoGlobal:0,
   lineas:[{id:1,desc:"Pastillas freno delanteras",tipo:"pieza",precio:58,qty:1,dto:0},{id:2,desc:"Discos de freno",tipo:"pieza",precio:120,qty:2,dto:10},{id:3,desc:"Mano obra (2h)",tipo:"trabajo",precio:45,qty:2,dto:0}],
   nota:"Los discos estaban muy desgastados, habia que cambiarlos."},
  {id:"ALB-002",cliente:"Carlos Ruiz",veh:"VW Golf 2017",mat:"2209FRT",mec:"Paco",fecha:"hoy 11:55",estado:"pendiente",dtoGlobal:5,
   lineas:[{id:1,desc:"Revision ITV",tipo:"trabajo",precio:40,qty:1,dto:0},{id:2,desc:"Reglaje luces",tipo:"trabajo",precio:20,qty:1,dto:0},{id:3,desc:"Presion neumaticos",tipo:"trabajo",precio:0,qty:1,dto:0}],
   nota:""},
];
const PEDIDOS0 = [
  {id:"PED-001",prov:"RecambiosPlus", pieza:"Kit embrague VW Golf 2017",      ref:"KE-VW-7G34", precio:87.50, para:"Carlos Ruiz",  mat:"2209FRT",estado:"solicitado",entrega:"manyana"},
  {id:"PED-002",prov:"AutoPartes Sur",pieza:"Amortiguador trasero Ford Focus", ref:"AMO-FF-TR21",precio:134.00,para:"Juan Lopez",    mat:"9034MNQ",estado:"en_camino", entrega:"hoy tarde"},
  {id:"PED-003",prov:"RecambiosPlus", pieza:"Filtro habitaculo Seat Ibiza",    ref:"FH-SI-19X",  precio:18.00, para:"Nuevo cliente",mat:"-",       estado:"recibido",  entrega:"-"},
];
const COMMS0 = [
  {id:1,canal:"tel",hora:"08:12",nombre:"Desconocido",    num:"654 321 987",txt:"Llamada perdida sin mensaje",ok:false},
  {id:2,canal:"wa", hora:"08:45",nombre:"Roberto Vega",   num:"612 098 765",txt:"Hola, quiero pedir cita para revisar los frenos del Peugeot 207.",ok:true},
  {id:3,canal:"tel",hora:"09:30",nombre:"Desconocido",    num:"699 112 233",txt:"Buzon: Llamo para saber si ya esta listo mi coche",ok:false},
  {id:4,canal:"wa", hora:"10:15",nombre:"Lucia Fernandez",num:"637 445 566",txt:"Buenos dias, puedo llevar mi Renault Megane manyana para cambio de aceite?",ok:false},
  {id:5,canal:"bot",hora:"11:00",nombre:"Miguel Ortega",  num:"611 778 899",txt:"Bot: Cita automatica - Honda Civic 2020 - Revision general - Martes 09:00",ok:false},
  {id:6,canal:"val",hora:"12:30",nombre:"Maria Garcia",   num:"612 345 678",txt:"5 estrellas: Muy rapidos y el precio muy justo. Volveria sin duda.",ok:true},
];
const RENT = [
  {tipo:"Cambio de aceite",  n:42,media:95, margen:62,total:3990},
  {tipo:"Frenos / pastillas",n:18,media:240,margen:55,total:4320},
  {tipo:"Neumaticos",        n:24,media:320,margen:38,total:7680},
  {tipo:"Embrague",          n:6, media:690,margen:48,total:4140},
  {tipo:"Diagnosis / averia",n:15,media:80, margen:71,total:1200},
  {tipo:"Revision completa", n:11,media:210,margen:52,total:2310},
  {tipo:"ITV preparacion",   n:9, media:55, margen:68,total:495 },
];

// ── COMPONENTES BASE ─────────────────────────────────────────────────────────
function Bdg({color,bg,txt}){
  return <span style={{background:bg,color,border:`1px solid ${color}40`,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:600,whiteSpace:"nowrap"}}>{txt}</span>;
}
function KPI({val,label,sub,color,dot}){
  return(
    <div style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:12,padding:"16px 20px",flex:1,minWidth:100,position:"relative"}}>
      {dot>0&&<div style={{position:"absolute",top:8,right:8,background:C.rojo,color:"#fff",borderRadius:"50%",width:17,height:17,fontSize:10,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center"}}>{dot}</div>}
      <div style={{fontSize:22,fontWeight:800,color:color||C.texto,fontFamily:"monospace",letterSpacing:"-1px"}}>{val}</div>
      <div style={{color:C.texto,fontSize:12,fontWeight:600,marginTop:3}}>{label}</div>
      {sub&&<div style={{color:C.textoSuave,fontSize:11,marginTop:1}}>{sub}</div>}
    </div>
  );
}
function Btn({children,onClick,v="ok",sm,disabled}){
  const s={
    ok:{bg:C.acento,      col:"#fff",        bd:"none"},
    gh:{bg:C.plomo,       col:C.textoSuave,  bd:`1px solid ${C.borde}`},
    gr:{bg:C.verdeClaro,  col:C.verde,       bd:`1px solid ${C.verde}40`},
    yw:{bg:C.amarilloClaro,col:C.amarillo,   bd:`1px solid ${C.amarillo}60`},
    rd:{bg:C.rojoClaro,   col:C.rojo,        bd:`1px solid ${C.rojo}40`},
    bl:{bg:C.azulClaro,   col:C.azul,        bd:`1px solid ${C.azul}40`},
    mo:{bg:C.moradoClaro, col:C.morado,      bd:`1px solid ${C.morado}40`},
  }[v]||{bg:C.acento,col:"#fff",bd:"none"};
  return <button onClick={onClick} disabled={disabled} style={{background:s.bg,color:s.col,border:s.bd,borderRadius:7,padding:sm?"4px 9px":"8px 13px",fontSize:sm?11:13,fontWeight:700,cursor:disabled?"default":"pointer",whiteSpace:"nowrap",opacity:disabled?0.4:1}}>{children}</button>;
}
function Inp({label,val,set,ph,type="text"}){
  return(
    <div style={{marginBottom:11}}>
      {label&&<label style={{display:"block",color:C.textoSuave,fontSize:11,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>{label}</label>}
      <input type={type} value={val} onChange={e=>set(e.target.value)} placeholder={ph}
        style={{width:"100%",background:C.plomo,border:`1px solid ${C.borde}`,borderRadius:7,padding:"8px 11px",color:C.texto,fontSize:13,boxSizing:"border-box"}}/>
    </div>
  );
}
function Dlg({title,onClose,children,w=480}){
  return(
    <div style={{position:"fixed",inset:0,background:"#000c",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:16}}>
      <div style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:14,padding:22,width:w,maxWidth:"100%",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <b style={{fontSize:15,color:C.texto}}>{title}</b>
          <button onClick={onClose} style={{background:"none",border:"none",color:C.textoSuave,fontSize:20,cursor:"pointer",lineHeight:1}}>x</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Hr({label}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,margin:"14px 0 10px"}}>
      <div style={{flex:1,height:1,background:C.borde}}/>
      <span style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</span>
      <div style={{flex:1,height:1,background:C.borde}}/>
    </div>
  );
}

// ── PORTAL CLIENTE ────────────────────────────────────────────────────────────
const EST_PORTAL = {
  completada:      {txt:"Listo para recoger",  col:C.verde,   bg:C.verdeClaro,   icon:"✅"},
  en_taller:       {txt:"En el taller ahora",  col:C.acento,  bg:C.acentoSuave,  icon:"🔧"},
  esperando_pieza: {txt:"Esperando una pieza", col:C.morado,  bg:C.moradoClaro,  icon:"📦"},
  esperando:       {txt:"En espera de entrada",col:C.amarillo,bg:C.amarilloClaro,icon:"⏳"},
  confirmada:      {txt:"Cita confirmada",     col:C.azul,    bg:C.azulClaro,    icon:"📅"},
};
const MSG_PORTAL = {
  completada:      "Tu vehiculo ha sido revisado y ya puede recogerse en el taller. Puedes llamarnos si tienes alguna duda.",
  en_taller:       "Nuestros mecanicos estan trabajando en tu vehiculo en este momento. Te avisaremos cuando este listo.",
  esperando_pieza: "Estamos esperando la llegada de una pieza necesaria para tu vehiculo. Te contactaremos en cuanto la recibamos.",
  esperando:       "Tu vehiculo esta en lista de espera para entrar al taller. Pronto comenzamos con el.",
  confirmada:      "Tu cita esta confirmada. Puedes traer el vehiculo en el horario acordado.",
};

function PortalCliente({citas,clientes}){
  const [mat,setMat]=useState("");
  const [dni,setDni]=useState("");
  const [resultado,setResultado]=useState(null); // null | "ok" | "error"
  const [datos,setDatos]=useState(null);
  const [intentos,setIntentos]=useState(0);

  const normalizar = s => s.replace(/\s/g,"").toUpperCase();

  const buscar = () => {
    if(!mat||!dni){setResultado("vacio");return;}
    const matN = normalizar(mat);
    const dniN = normalizar(dni);
    // Buscar cliente que tenga esa matricula Y ese DNI
    const cliente = clientes.find(c=>normalizar(c.matricula)===matN && normalizar(c.dni)===dniN);
    if(!cliente){setIntentos(i=>i+1);setResultado("error");setDatos(null);return;}
    // Buscar cita activa para esa matricula
    const cita = citas.find(c=>normalizar(c.matricula)===matN);
    setResultado("ok");
    setDatos({cliente,cita});
  };

  const limpiar=()=>{setMat("");setDni("");setResultado(null);setDatos(null);setIntentos(0);};

  return(
    <div style={{maxWidth:480,margin:"0 auto"}}>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{width:52,height:52,background:C.acento,borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,margin:"0 auto 12px"}}>🔧</div>
        <div style={{fontSize:20,fontWeight:800,color:C.texto,letterSpacing:"-0.5px"}}>Estado de tu vehiculo</div>
        <div style={{fontSize:13,color:C.textoSuave,marginTop:4}}>Introduce tu matricula y DNI para consultar</div>
      </div>

      {resultado!=="ok" && (
        <div style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:14,padding:24}}>
          <Inp label="Matricula" val={mat} set={setMat} ph="Ej: 4821 KPL"/>
          <Inp label="DNI / NIE" val={dni} set={setDni} ph="Ej: 12345678A"/>

          {resultado==="error"&&(
            <div style={{background:C.rojoClaro,border:`1px solid ${C.rojo}40`,borderRadius:8,padding:"10px 13px",marginBottom:12,fontSize:13,color:C.rojo}}>
              No encontramos ningun vehiculo con esos datos.{intentos>=2?" Comprueba que no haya espacios o errores.":""}
            </div>
          )}
          {resultado==="vacio"&&(
            <div style={{background:C.amarilloClaro,border:`1px solid ${C.amarillo}40`,borderRadius:8,padding:"10px 13px",marginBottom:12,fontSize:13,color:C.amarillo}}>
              Por favor introduce la matricula y el DNI.
            </div>
          )}

          <Btn onClick={buscar} sm={false}>Consultar estado</Btn>
          <div style={{marginTop:14,padding:"10px 13px",background:C.plomo,borderRadius:8,fontSize:11,color:C.textoSuave,lineHeight:1.6}}>
            <b style={{color:C.texto}}>Datos de prueba:</b><br/>
            Matricula: <code style={{color:C.acento}}>4821KPL</code> &nbsp; DNI: <code style={{color:C.acento}}>12345678A</code><br/>
            Matricula: <code style={{color:C.acento}}>9034MNQ</code> &nbsp; DNI: <code style={{color:C.acento}}>23456789B</code><br/>
            Matricula: <code style={{color:C.acento}}>2209FRT</code> &nbsp; DNI: <code style={{color:C.acento}}>34567890C</code>
          </div>
        </div>
      )}

      {resultado==="ok"&&datos&&(()=>{
        const {cliente,cita}=datos;
        const est=cita?EST_PORTAL[cita.estado]||EST_PORTAL.confirmada:null;
        const msg=cita?MSG_PORTAL[cita.estado]||"":"";
        return(
          <div>
            {/* Tarjeta de estado */}
            <div style={{background:C.carbono,border:`1px solid ${est?est.col+"50":C.borde}`,borderRadius:14,padding:22,marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:13,marginBottom:16}}>
                <div style={{fontSize:36}}>{est?est.icon:"🚗"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:C.textoSuave,fontWeight:600}}>Hola, {cliente.nombre}</div>
                  <div style={{fontSize:16,fontWeight:800,color:C.texto,marginTop:1}}>{cliente.vehiculo}</div>
                  <div style={{fontFamily:"monospace",fontSize:13,color:C.textoSuave,letterSpacing:"0.05em"}}>{(cliente.vehiculos&&cliente.vehiculos[0])?cliente.vehiculos[0].matricula:cliente.matricula}</div>
                </div>
              </div>

              {cita?(
                <>
                  <div style={{background:est.bg,border:`1px solid ${est.col}40`,borderRadius:10,padding:"14px 16px",marginBottom:12}}>
                    <div style={{fontSize:16,fontWeight:800,color:est.col,marginBottom:6}}>{est.txt}</div>
                    <div style={{fontSize:13,color:C.texto,lineHeight:1.6}}>{msg}</div>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <div style={{background:C.plomo,borderRadius:8,padding:"10px 13px"}}>
                      <div style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:3}}>Servicio</div>
                      <div style={{color:C.texto,fontSize:13}}>{cita.servicio}</div>
                    </div>
                    <div style={{background:C.plomo,borderRadius:8,padding:"10px 13px"}}>
                      <div style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:3}}>Hora cita</div>
                      <div style={{color:C.texto,fontSize:13,fontFamily:"monospace",fontWeight:700}}>{cita.hora}</div>
                    </div>
                  </div>
                </>
              ):(
                <div style={{background:C.plomo,borderRadius:10,padding:"16px",textAlign:"center"}}>
                  <div style={{fontSize:24,marginBottom:8}}>😊</div>
                  <div style={{color:C.texto,fontSize:14,fontWeight:600}}>No tienes visita activa hoy</div>
                  <div style={{color:C.textoSuave,fontSize:12,marginTop:4}}>Llamanos si quieres pedir cita</div>
                </div>
              )}
            </div>

            {/* Historial rapido */}
            {(()=>{
              const revs=REVISIONES.filter(r=>r.mat===cliente.matricula).slice(0,3);
              if(!revs.length)return null;
              return(
                <div style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:14,padding:18,marginBottom:14}}>
                  <div style={{fontSize:13,fontWeight:700,color:C.texto,marginBottom:12}}>Tus ultimas revisiones</div>
                  {revs.map((r,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<revs.length-1?`1px solid ${C.borde}`:"none"}}>
                      <div style={{flex:1}}>
                        <div style={{color:C.texto,fontSize:12,fontWeight:600}}>{r.srv}</div>
                        <div style={{color:C.textoSuave,fontSize:11}}>{r.fecha} &middot; {r.km.toLocaleString()} km</div>
                      </div>
                      <div style={{color:C.verde,fontFamily:"monospace",fontSize:12,fontWeight:700}}>{fmtEur(r.imp)}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            <Btn v="gh" onClick={limpiar}>Consultar otro vehiculo</Btn>
          </div>
        );
      })()}
    </div>
  );
}



// ── BUSCADOR DE CLIENTE ───────────────────────────────────────────────────────
function ClienteBuscador({value, onChange, onSeleccionar, clientes}){
  const [abierto, setAbierto] = useState(false);
  const [q, setQ]             = useState(value||"");

  const filtrados = q.length>0
    ? clientes.filter(c=>
        (c.nombre||"").toLowerCase().includes(q.toLowerCase()) ||
        (c.vehiculos||[]).some(v=>(v.matricula||"").toLowerCase().includes(q.toLowerCase())) ||
        (c.tel||"").includes(q)
      ).slice(0,6)
    : [];

  const seleccionar = cli => {
    setQ(cli.nombre);
    onChange(cli.nombre);
    onSeleccionar(cli);
    setAbierto(false);
  };

  return(
    <div style={{marginBottom:11,position:"relative"}}>
      <label style={{display:"block",color:C.textoSuave,fontSize:11,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Cliente</label>
      <input
        value={q}
        onChange={e=>{setQ(e.target.value);onChange(e.target.value);setAbierto(true);}}
        onFocus={()=>setAbierto(true)}
        placeholder="Nombre, matricula o telefono..."
        style={{width:"100%",background:C.plomo,border:`1px solid ${abierto&&filtrados.length>0?C.acento:C.borde}`,borderRadius:7,padding:"9px 12px",color:C.texto,fontSize:13,boxSizing:"border-box"}}
      />
      {abierto&&filtrados.length>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:300,background:C.carbono,border:`1px solid ${C.acento}`,borderRadius:10,overflow:"hidden",marginTop:4,boxShadow:"0 8px 24px #000a"}}>
          {filtrados.map(cli=>(
            <div key={cli.id} onClick={()=>seleccionar(cli)}
              style={{padding:"10px 14px",cursor:"pointer",borderBottom:`1px solid ${C.borde}`,display:"flex",alignItems:"center",gap:12}}
              onMouseEnter={e=>e.currentTarget.style.background=C.plomo}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{width:32,height:32,borderRadius:"50%",background:C.acentoSuave,border:`1px solid ${C.acento}40`,display:"flex",alignItems:"center",justifyContent:"center",color:C.acento,fontWeight:800,fontSize:14,flexShrink:0}}>
                {(cli.nombre||"?")[0]}
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,color:C.texto,fontSize:13}}>{cli.nombre||""}</div>
                <div style={{color:C.textoSuave,fontSize:11}}>
                  {(cli.vehiculos||[]).length} coche{(cli.vehiculos||[]).length!==1?"s":""} · {(cli.vehiculos||[]).map(v=>v.matricula).join(", ")}
                </div>
              </div>
              <div style={{color:C.textoSuave,fontSize:11,fontFamily:"monospace",flexShrink:0}}>{cli.tel}</div>
            </div>
          ))}
        </div>
      )}
      {abierto&&q.length>0&&filtrados.length===0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:300,background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:10,padding:"12px 14px",marginTop:4,color:C.textoSuave,fontSize:12}}>
          No hay clientes con ese nombre. Se creara como nuevo.
        </div>
      )}
    </div>
  );
}

// ── SELECTOR DE HORA ─────────────────────────────────────────────────────────
function TimePicker({value, onChange}){
  const [abierto, setAbierto] = useState(false);
  const [fase, setFase]       = useState("horas"); // "horas" | "minutos"
  const horas   = [8,9,10,11,12,13,14,15,16,17,18,19];
  const minutos = [0,5,10,15,20,25,30,35,40,45,50,55];

  const partes  = value ? value.split(":") : ["--","--"];
  const hSel    = partes[0];
  const mSel    = partes[1];

  const elegirHora = h => {
    const hStr = String(h).padStart(2,"0");
    const mStr = mSel==="--" ? "00" : mSel;
    onChange(`${hStr}:${mStr}`);
    setFase("minutos");
  };
  const elegirMin = m => {
    const hStr = hSel==="--" ? "08" : hSel;
    const mStr = String(m).padStart(2,"0");
    onChange(`${hStr}:${mStr}`);
    setFase("horas");
    setAbierto(false);
  };

  return(
    <div style={{marginBottom:11,position:"relative"}}>
      <label style={{display:"block",color:C.textoSuave,fontSize:11,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Hora</label>
      {/* Campo visible */}
      <div onClick={()=>{setAbierto(a=>!a);setFase("horas");}}
        style={{width:"100%",background:C.plomo,border:`1px solid ${abierto?C.acento:C.borde}`,borderRadius:7,padding:"9px 12px",color:value?C.texto:C.textoSuave,fontSize:13,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",boxSizing:"border-box"}}>
        <span style={{fontFamily:"monospace",fontWeight:value?700:400}}>{value||"Seleccionar hora"}</span>
        <span style={{fontSize:16}}>🕐</span>
      </div>

      {/* Panel del reloj */}
      {abierto&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,zIndex:300,background:C.carbono,border:`1px solid ${C.acento}`,borderRadius:10,padding:14,marginTop:4,boxShadow:"0 8px 32px #000a"}}>
          {/* Selector fase */}
          <div style={{display:"flex",gap:4,marginBottom:12,background:C.plomo,borderRadius:7,padding:3}}>
            {[["horas","Hora"],["minutos","Minutos"]].map(([k,l])=>(
              <button key={k} onClick={()=>setFase(k)}
                style={{flex:1,background:fase===k?C.acento:"none",color:fase===k?"#fff":C.textoSuave,border:"none",borderRadius:5,padding:"5px 0",fontSize:12,fontWeight:700,cursor:"pointer"}}>
                {l} {k==="horas"?hSel!=="--"?hSel+"h":"":mSel!=="--"?mSel+"m":""}
              </button>
            ))}
          </div>

          {/* Grid de horas */}
          {fase==="horas"&&(
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
              {horas.map(h=>{
                const hStr=String(h).padStart(2,"0");
                const sel=hStr===hSel;
                return(
                  <button key={h} onClick={()=>elegirHora(h)}
                    style={{background:sel?C.acento:C.plomo,color:sel?"#fff":C.texto,border:`1px solid ${sel?C.acento:C.borde}`,borderRadius:7,padding:"9px 4px",fontSize:13,fontWeight:sel?700:400,cursor:"pointer",fontFamily:"monospace"}}>
                    {hStr}:00
                  </button>
                );
              })}
            </div>
          )}

          {/* Grid de minutos */}
          {fase==="minutos"&&(
            <div>
              <div style={{color:C.textoSuave,fontSize:11,marginBottom:8,textAlign:"center"}}>
                Minutos para las <b style={{color:C.acento}}>{hSel}h</b>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
                {minutos.map(m=>{
                  const mStr=String(m).padStart(2,"0");
                  const sel=mStr===mSel;
                  return(
                    <button key={m} onClick={()=>elegirMin(m)}
                      style={{background:sel?C.acento:C.plomo,color:sel?"#fff":C.texto,border:`1px solid ${sel?C.acento:C.borde}`,borderRadius:7,padding:"9px 4px",fontSize:13,fontWeight:sel?700:400,cursor:"pointer",fontFamily:"monospace"}}>
                      :{mStr}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button onClick={()=>setAbierto(false)} style={{marginTop:10,width:"100%",background:C.plomo,border:`1px solid ${C.borde}`,color:C.textoSuave,borderRadius:7,padding:"7px",fontSize:12,cursor:"pointer"}}>Cerrar</button>
        </div>
      )}
    </div>
  );
}

// ── AGENDA ───────────────────────────────────────────────────────────────────
const EST = {
  completada:      {txt:"Completada",     col:C.verde,      bg:C.verdeClaro},
  en_taller:       {txt:"En taller",      col:C.acento,     bg:C.acentoSuave},
  esperando:       {txt:"Esperando",      col:C.amarillo,   bg:C.amarilloClaro},
  esperando_pieza: {txt:"Esperando pieza",col:C.morado,     bg:C.moradoClaro},
  confirmada:      {txt:"Confirmada",     col:C.textoSuave, bg:C.plomo},
};

// Helpers de fecha
const DIAS=["Dom","Lun","Mar","Mie","Jue","Vie","Sab"];
const MESES=["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const fmtFecha=d=>`${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
const fmtFechaCorta=d=>`${d.getDate()}/${d.getMonth()+1}`;
const clavesDia=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const hoy=new Date(); hoy.setHours(0,0,0,0); // fecha real de hoy

// Citas de ejemplo para otros dias de la semana (datos ficticios)
const EXTRA_CITAS=[
  {id:101,fecha:"2026-06-22",hora:"09:00",cliente:"Marta Iglesias",vehiculo:"Seat Leon 2020",matricula:"8821ABC",servicio:"Revision general",estado:"completada",tel:"666111222",rec:"enviado"},
  {id:102,fecha:"2026-06-22",hora:"11:00",cliente:"Tomas Vidal",vehiculo:"Ford Kuga 2019",matricula:"3344DEF",servicio:"Cambio aceite",estado:"completada",tel:"677222333",rec:"enviado"},
  {id:103,fecha:"2026-06-23",hora:"10:00",cliente:"Sara Blanco",vehiculo:"Hyundai Tucson",matricula:"5566GHI",servicio:"Frenos traseros",estado:"completada",tel:"688333444",rec:"enviado"},
  {id:104,fecha:"2026-06-24",hora:"08:30",cliente:"Diego Molina",vehiculo:"Kia Sportage",matricula:"7788JKL",servicio:"ITV preparacion",estado:"completada",tel:"699444555",rec:"enviado"},
  {id:105,fecha:"2026-06-24",hora:"12:00",cliente:"Lucia Perez",vehiculo:"Dacia Sandero",matricula:"9900MNO",servicio:"Cambio bateria",estado:"completada",tel:"600555666",rec:"enviado"},
  {id:106,fecha:"2026-06-25",hora:"09:30",cliente:"Andres Gil",vehiculo:"Opel Astra 2021",matricula:"1122PQR",servicio:"Diagnosis averia",estado:"completada",tel:"611666777",rec:"enviado"},
  {id:107,fecha:"2026-06-26",hora:"10:30",cliente:"Elena Ramos",vehiculo:"Mazda CX5",matricula:"3344STU",servicio:"Cambio neumaticos",estado:"completada",tel:"622777888",rec:"enviado"},
  {id:108,fecha:"2026-06-26",hora:"15:00",cliente:"Pablo Herrera",vehiculo:"BMW Serie 3",matricula:"5566VWX",servicio:"Revision completa",estado:"completada",tel:"633888999",rec:"enviado"},
  {id:109,fecha:"2026-06-28",hora:"09:00",cliente:"Carmen Soto",vehiculo:"Seat Arona 2022",matricula:"7788YZA",servicio:"Cambio aceite",estado:"confirmada",tel:"644999000",rec:"no_enviado"},
  {id:110,fecha:"2026-06-28",hora:"11:30",cliente:"Victor Mora",vehiculo:"Toyota Yaris",matricula:"9900BCD",servicio:"Frenos delanteros",estado:"confirmada",tel:"655000111",rec:"no_enviado"},
  {id:111,fecha:"2026-06-29",hora:"10:00",cliente:"Isabel Castro",vehiculo:"Renault Captur",matricula:"1122EFG",servicio:"ITV preparacion",estado:"confirmada",tel:"666111333",rec:"no_enviado"},
  {id:112,fecha:"2026-06-30",hora:"09:30",cliente:"Marcos Ruiz",vehiculo:"Peugeot 2008",matricula:"3344HIJ",servicio:"Revision general",estado:"confirmada",tel:"677222444",rec:"no_enviado"},
  {id:113,fecha:"2026-06-30",hora:"14:00",cliente:"Nuria Vega",vehiculo:"Citroen C3",matricula:"5566KLM",servicio:"Cambio neumaticos",estado:"confirmada",tel:"688333555",rec:"no_enviado"},
];

function TarjetaCita({c,onCambiar,onRecordar,onClick}){
  const e=EST[c.estado]||EST.confirmada;
  return(
    <div onClick={onClick} style={{background:C.carbono,border:`1px solid ${c.estado==="en_taller"?C.acento+"55":c.estado==="esperando_pieza"?C.morado+"55":C.borde}`,borderRadius:10,padding:"11px 14px",display:"flex",alignItems:"center",gap:11,flexWrap:"wrap",cursor:onClick?"pointer":"default"}}>
      <div style={{width:44,textAlign:"center",flexShrink:0}}>
        <div style={{fontSize:13,fontWeight:800,color:C.acento,fontFamily:"monospace"}}>{c.hora}</div>
      </div>
      <div style={{flex:1,minWidth:140}}>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
          <span style={{fontWeight:700,color:C.texto,fontSize:13}}>{c.cliente}</span>
          <span style={{color:C.textoSuave,fontSize:11}}>{c.vehiculo}</span>
          <span style={{background:C.plomo,color:C.textoSuave,borderRadius:4,padding:"1px 5px",fontSize:10,fontFamily:"monospace"}}>{c.matricula}</span>
        </div>
        <div style={{color:C.textoSuave,fontSize:11,marginTop:2}}>{c.servicio}</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0,flexWrap:"wrap"}}>
        {c.rec==="enviado"
          ?<span style={{fontSize:10,color:C.verde,fontWeight:600}}>Recordatorio OK</span>
          :<Btn v="gh" sm onClick={()=>onRecordar(c.id)}>Recordar</Btn>}
        <Bdg color={e.col} bg={e.bg} txt={e.txt}/>
        <select value={c.estado} onChange={ev=>onCambiar(c.id,ev.target.value)}
          style={{background:C.plomo,color:C.textoSuave,border:`1px solid ${C.borde}`,borderRadius:6,padding:"3px 6px",fontSize:10,cursor:"pointer"}}>
          <option value="confirmada">Confirmada</option>
          <option value="esperando">Esperando</option>
          <option value="en_taller">En taller</option>
          <option value="esperando_pieza">Esp. pieza</option>
          <option value="completada">Completada</option>
        </select>
      </div>
    </div>
  );
}

function Agenda({citas,set,clientes}){
  const [vista,setVista]    =useState("dia");
  const [offset,setOffset]  =useState(0);
  const [dlg,setDlg]        =useState(false);
  const [citaDet,setCitaDet]=useState(null); // cita abierta en detalle
  const [n,setN]            =useState({hora:"",cliente:"",vehiculo:"",matricula:"",servicio:"",tel:"",fecha:""});
  const [toast,setToast]    =useState(null);

  // Combina citas reales (sin fecha = hoy) con las de ejemplo para otros dias
  const todasCitas=[
    ...citas.map(c=>({...c,fecha:c.fecha||"2026-06-27"})),
    ...EXTRA_CITAS,
  ];

  const cambiar=(id,est)=>{
    if(est==="completada"){
      const c=todasCitas.find(x=>x.id===id);
      if(c){setToast(c.cliente);setTimeout(()=>setToast(null),3000);}
    }
    // Solo actualiza las citas reales (no las de ejemplo)
    if(citas.find(x=>x.id===id)) set(citas.map(c=>c.id===id?{...c,estado:est}:c));
  };
  const recordar=id=>{
    if(citas.find(x=>x.id===id)) set(citas.map(c=>c.id===id?{...c,rec:"enviado"}:c));
  };
  const guardar=()=>{
    if(!n.cliente||!n.hora)return;
    const fechaNueva=n.fecha||"2026-06-27";
    set([...citas,{...n,id:Date.now(),fecha:fechaNueva,estado:"confirmada",rec:"no_enviado"}]);
    setN({hora:"",cliente:"",vehiculo:"",matricula:"",servicio:"",tel:"",fecha:""});
    setDlg(false);
  };

  // ── Calculos de rango segun vista ─────────────────────────────────────────
  const base=new Date(hoy);
  let titulo="", diasRango=[];

  if(vista==="dia"){
    base.setDate(base.getDate()+offset);
    titulo=fmtFecha(base);
    diasRango=[clavesDia(base)];
  } else if(vista==="semana"){
    // Lunes de la semana actual + offset semanas
    const lunes=new Date(hoy);
    const diff=hoy.getDay()===0?-6:1-hoy.getDay();
    lunes.setDate(hoy.getDate()+diff+offset*7);
    const domingo=new Date(lunes); domingo.setDate(lunes.getDate()+6);
    titulo=`${fmtFecha(lunes)} — ${fmtFecha(domingo)}`;
    for(let i=0;i<7;i++){const d=new Date(lunes);d.setDate(lunes.getDate()+i);diasRango.push(clavesDia(d));}
  } else {
    // Mes
    const mesBase=new Date(hoy.getFullYear(),hoy.getMonth()+offset,1);
    titulo=`${MESES[mesBase.getMonth()]} ${mesBase.getFullYear()}`;
    const ultimo=new Date(mesBase.getFullYear(),mesBase.getMonth()+1,0).getDate();
    for(let i=1;i<=ultimo;i++){
      const d=new Date(mesBase.getFullYear(),mesBase.getMonth(),i);
      diasRango.push(clavesDia(d));
    }
  }

  // Citas filtradas por rango
  const citasRango=todasCitas.filter(c=>diasRango.includes(c.fecha));
  const recPend=citas.filter(c=>c.rec!=="enviado").length;

  return(
    <div>
      {toast&&<div style={{position:"fixed",bottom:22,right:22,zIndex:999,background:C.verde,color:"#fff",borderRadius:12,padding:"13px 18px",fontWeight:700,fontSize:13,boxShadow:"0 4px 20px #0009"}}>Aviso enviado a {toast} por WhatsApp</div>}

      {/* ── CABECERA ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
        <div style={{fontSize:17,fontWeight:700,color:C.texto}}>Agenda</div>
        <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
          {/* Selector de vista */}
          <div style={{display:"flex",background:C.plomo,borderRadius:8,padding:2,gap:2}}>
            {[["dia","Dia"],["semana","Semana"],["mes","Mes"]].map(([k,l])=>(
              <button key={k} onClick={()=>{setVista(k);setOffset(0);}}
                style={{background:vista===k?C.acento:"none",color:vista===k?"#fff":C.textoSuave,border:"none",borderRadius:6,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                {l}
              </button>
            ))}
          </div>
          {/* Navegacion */}
          <button onClick={()=>setOffset(o=>o-1)} style={{background:C.plomo,border:`1px solid ${C.borde}`,color:C.texto,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:14}}>&#8249;</button>
          <button onClick={()=>setOffset(0)} style={{background:C.plomo,border:`1px solid ${C.borde}`,color:C.textoSuave,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:11}}>Hoy</button>
          <button onClick={()=>setOffset(o=>o+1)} style={{background:C.plomo,border:`1px solid ${C.borde}`,color:C.texto,borderRadius:7,padding:"5px 10px",cursor:"pointer",fontSize:14}}>&#8250;</button>
          {recPend>0&&<Btn v="yw" sm onClick={()=>set(citas.map(c=>({...c,rec:"enviado"})))}>Recordatorios ({recPend})</Btn>}
          <Btn onClick={()=>setDlg(true)}>+ Nueva cita</Btn>
        </div>
      </div>

      {/* Titulo del rango */}
      <div style={{fontSize:13,color:C.textoSuave,marginBottom:14,fontWeight:600}}>{titulo} · {citasRango.length} cita{citasRango.length!==1?"s":""}</div>

      {/* ── VISTA DIA ── */}
      {vista==="dia"&&(
        <div style={{display:"flex",flexDirection:"column",gap:7}}>
          {citasRango.length===0&&<div style={{color:C.textoSuave,fontSize:13,textAlign:"center",padding:"40px 0"}}>Sin citas este dia</div>}
          {[...citasRango].sort((a,b)=>a.hora.localeCompare(b.hora)).map(c=>(
            <TarjetaCita key={c.id} c={c} onCambiar={cambiar} onRecordar={recordar} onClick={()=>setCitaDet(c)}/>
          ))}
        </div>
      )}

      {/* ── VISTA SEMANA ── */}
      {vista==="semana"&&(()=>{
        const lunes=new Date(hoy);
        const diff=hoy.getDay()===0?-6:1-hoy.getDay();
        lunes.setDate(hoy.getDate()+diff+offset*7);
        return(
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6}}>
            {diasRango.map((clave,i)=>{
              const d=new Date(lunes); d.setDate(lunes.getDate()+i);
              const citasDia=[...citasRango].filter(c=>c.fecha===clave).sort((a,b)=>a.hora.localeCompare(b.hora));
              const esHoy=clave===clavesDia(hoy);
              return(
                <div key={clave} style={{background:C.carbono,border:`1px solid ${esHoy?C.acento+"60":C.borde}`,borderRadius:10,padding:"10px 8px",minHeight:120}}>
                  <div style={{textAlign:"center",marginBottom:8}}>
                    <div style={{fontSize:10,color:C.textoSuave,fontWeight:600,textTransform:"uppercase"}}>{DIAS[d.getDay()]}</div>
                    <div style={{fontSize:18,fontWeight:800,color:esHoy?C.acento:C.texto,fontFamily:"monospace"}}>{d.getDate()}</div>
                  </div>
                  {citasDia.length===0&&<div style={{color:C.borde,fontSize:10,textAlign:"center"}}>-</div>}
                  {citasDia.map(c=>{
                    const e=EST[c.estado]||EST.confirmada;
                    return(
                      <div key={c.id} onClick={()=>setCitaDet(c)} style={{background:e.bg,border:`1px solid ${e.col}40`,borderRadius:6,padding:"4px 6px",marginBottom:4,cursor:"pointer"}}>
                        <div style={{color:e.col,fontSize:10,fontWeight:700}}>{c.hora}</div>
                        <div style={{color:C.texto,fontSize:10,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.cliente}</div>
                        <div style={{color:C.textoSuave,fontSize:9,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.servicio}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── VISTA MES ── */}
      {vista==="mes"&&(()=>{
        const mesBase=new Date(hoy.getFullYear(),hoy.getMonth()+offset,1);
        const primerDia=mesBase.getDay()===0?6:mesBase.getDay()-1; // 0=lunes
        const totalDias=new Date(mesBase.getFullYear(),mesBase.getMonth()+1,0).getDate();
        const celdas=[];
        // Celdas vacias antes del primer dia
        for(let i=0;i<primerDia;i++) celdas.push(null);
        for(let i=1;i<=totalDias;i++) celdas.push(i);

        return(
          <div>
            {/* Cabecera dias semana */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
              {["Lun","Mar","Mie","Jue","Vie","Sab","Dom"].map(d=>(
                <div key={d} style={{textAlign:"center",color:C.textoSuave,fontSize:10,fontWeight:600,padding:"4px 0"}}>{d}</div>
              ))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
              {celdas.map((dia,i)=>{
                if(!dia) return <div key={`v${i}`}/>;
                const clave=`${mesBase.getFullYear()}-${String(mesBase.getMonth()+1).padStart(2,"0")}-${String(dia).padStart(2,"0")}`;
                const citasDia=todasCitas.filter(c=>c.fecha===clave);
                const esHoy=clave===clavesDia(hoy);
                return(
                  <div key={clave} onClick={()=>{setVista("dia");const diff2=new Date(clave)-new Date(clavesDia(hoy));setOffset(Math.round(diff2/(1000*60*60*24)));}}
                    style={{background:esHoy?C.acento+"22":C.carbono,border:`1px solid ${esHoy?C.acento+"60":citasDia.length>0?C.borde+"88":C.borde+"33"}`,borderRadius:8,padding:"6px 4px",minHeight:64,cursor:"pointer",opacity:citasDia.length===0?0.5:1}}>
                    <div style={{textAlign:"center",marginBottom:4}}>
                      <span style={{fontSize:12,fontWeight:700,color:esHoy?C.acento:C.texto}}>{dia}</span>
                    </div>
                    {citasDia.slice(0,2).map(c=>{
                      const e=EST[c.estado]||EST.confirmada;
                      return(
                        <div key={c.id} onClick={e=>{e.stopPropagation();setCitaDet(c);}} style={{background:e.col+"22",borderLeft:`2px solid ${e.col}`,borderRadius:3,padding:"2px 4px",marginBottom:2,cursor:"pointer"}}>
                          <div style={{color:e.col,fontSize:9,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{c.hora} {c.cliente.split(" ")[0]}</div>
                        </div>
                      );
                    })}
                    {citasDia.length>2&&<div style={{color:C.textoSuave,fontSize:9,textAlign:"center"}}>+{citasDia.length-2} mas</div>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* MODAL DETALLE CITA */}
      {citaDet&&(
        <Dlg title="Detalle de cita" onClose={()=>setCitaDet(null)} w={460}>
          {/* Cabecera */}
          <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18,paddingBottom:14,borderBottom:`1px solid ${C.borde}`}}>
            <div style={{flex:1}}>
              <div style={{fontSize:17,fontWeight:800,color:C.texto}}>{citaDet.cliente}</div>
              <div style={{color:C.textoSuave,fontSize:12,marginTop:3}}>{citaDet.vehiculo} · <span style={{fontFamily:"monospace"}}>{citaDet.matricula}</span></div>
              {citaDet.tel&&<div style={{color:C.textoSuave,fontSize:12,marginTop:2}}>📞 {citaDet.tel}</div>}
            </div>
            <a href={`tel:${citaDet.tel}`} style={{background:C.verdeClaro,border:`1px solid ${C.verde}40`,color:C.verde,borderRadius:7,padding:"6px 12px",fontSize:12,fontWeight:700,textDecoration:"none"}}>Llamar</a>
          </div>
          {/* Info */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
            <div style={{background:C.plomo,borderRadius:8,padding:"10px 13px"}}>
              <div style={{color:C.textoSuave,fontSize:10,fontWeight:600,textTransform:"uppercase",marginBottom:3}}>Fecha y hora</div>
              <div style={{color:C.acento,fontFamily:"monospace",fontWeight:800,fontSize:15}}>{citaDet.hora}</div>
              <div style={{color:C.textoSuave,fontSize:11,marginTop:2}}>{citaDet.fecha||"Hoy"}</div>
            </div>
            <div style={{background:C.plomo,borderRadius:8,padding:"10px 13px"}}>
              <div style={{color:C.textoSuave,fontSize:10,fontWeight:600,textTransform:"uppercase",marginBottom:3}}>Estado</div>
              {(()=>{const e=EST[citaDet.estado]||EST.confirmada;return <Bdg color={e.col} bg={e.bg} txt={e.txt}/>;})()}
            </div>
          </div>
          <div style={{background:C.plomo,borderRadius:8,padding:"11px 13px",marginBottom:16}}>
            <div style={{color:C.textoSuave,fontSize:10,fontWeight:600,textTransform:"uppercase",marginBottom:4}}>Servicio</div>
            <div style={{color:C.texto,fontSize:13,fontWeight:600}}>{citaDet.servicio}</div>
          </div>
          {/* Cambiar estado */}
          <div style={{marginBottom:8}}>
            <div style={{color:C.textoSuave,fontSize:10,fontWeight:600,textTransform:"uppercase",marginBottom:6}}>Cambiar estado</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {Object.entries(EST).map(([k,e])=>(
                <button key={k} onClick={()=>{cambiar(citaDet.id,k);setCitaDet({...citaDet,estado:k});}}
                  style={{background:citaDet.estado===k?e.bg:C.plomo,color:citaDet.estado===k?e.col:C.textoSuave,border:`1px solid ${citaDet.estado===k?e.col+"60":C.borde}`,borderRadius:7,padding:"6px 10px",fontSize:11,fontWeight:citaDet.estado===k?700:400,cursor:"pointer"}}>
                  {e.txt}
                </button>
              ))}
            </div>
          </div>
        </Dlg>
      )}

      {/* MODAL NUEVA CITA */}}
      {dlg&&<Dlg title="Nueva cita" onClose={()=>setDlg(false)} w={420}>
        <Inp label="Fecha" val={n.fecha} set={v=>setN({...n,fecha:v})} ph="2026-06-27 (AAAA-MM-DD)"/>
        <TimePicker value={n.hora} onChange={v=>setN({...n,hora:v})}/>
        <ClienteBuscador
          value={n.cliente}
          onChange={v=>setN({...n,cliente:v})}
          onSeleccionar={cli=>setN(prev=>({...prev,cliente:cli.nombre||"",tel:cli.tel||"",vehiculo:"",matricula:"",_vehiculos:Array.isArray(cli.vehiculos)?cli.vehiculos:[]}))}
          clientes={clientes||[]}
        />
        {/* Si hay vehiculos del cliente, mostrar selector */}
        {n._vehiculos&&n._vehiculos.length>0&&(
          <div style={{marginBottom:11}}>
            <label style={{display:"block",color:C.textoSuave,fontSize:11,fontWeight:600,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>Vehiculo</label>
            <div style={{display:"flex",flexDirection:"column",gap:5}}>
              {n._vehiculos.map(v=>{
                const sel=n.matricula===v.matricula;
                return(
                  <div key={v.id} onClick={()=>setN(prev=>({...prev,vehiculo:v.modelo,matricula:v.matricula}))}
                    style={{background:sel?C.acentoSuave:C.plomo,border:`1px solid ${sel?C.acento:C.borde}`,borderRadius:8,padding:"9px 12px",cursor:"pointer",display:"flex",alignItems:"center",gap:10}}>
                    <div style={{fontSize:18}}>{sel?"🚗":"⬜"}</div>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:sel?700:400,color:sel?C.texto:C.textoSuave,fontSize:13}}>{v.modelo}</div>
                      <div style={{fontFamily:"monospace",fontSize:11,color:sel?C.acento:C.textoSuave}}>{v.matricula}</div>
                    </div>
                    {sel&&<div style={{color:C.acento,fontWeight:700,fontSize:11}}>Seleccionado</div>}
                  </div>
                );
              })}
              <div onClick={()=>setN(prev=>({...prev,vehiculo:"",matricula:"",_vehiculos:[]}))}
                style={{background:C.plomo,border:`1px dashed ${C.borde}`,borderRadius:8,padding:"8px 12px",cursor:"pointer",color:C.textoSuave,fontSize:12,textAlign:"center"}}>
                + Nuevo vehiculo para este cliente
              </div>
            </div>
          </div>
        )}
        {/* Si no hay vehiculos cargados (nuevo cliente o nuevo vehiculo), mostrar campos */}
        {(!n._vehiculos||n._vehiculos.length===0)&&(
          <>
            <Inp label="Vehiculo" val={n.vehiculo} set={v=>setN({...n,vehiculo:v})} ph="Marca Modelo Anyo"/>
            <Inp label="Matricula" val={n.matricula} set={v=>setN({...n,matricula:v})} ph="0000 XXX"/>
          </>
        )}
        {n.tel&&(
          <div style={{background:C.verdeClaro,border:`1px solid ${C.verde}40`,borderRadius:8,padding:"7px 12px",marginBottom:11,display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:13}}>✓</span>
            <div style={{fontSize:12,color:C.verde,fontWeight:600}}>Cliente existente</div>
            <div style={{flex:1,textAlign:"right",color:C.textoSuave,fontSize:11,fontFamily:"monospace"}}>{n.tel}</div>
          </div>
        )}
        {[["tel","Telefono","6XX XXX XXX"],["servicio","Servicio","Que necesita?"]].map(([k,l,p])=>(
          <Inp key={k} label={l} val={n[k]} set={v=>setN({...n,[k]:v})} ph={p}/>
        ))}
        <div style={{display:"flex",gap:8,marginTop:6}}>
          <Btn v="gh" onClick={()=>setDlg(false)}>Cancelar</Btn>
          <Btn onClick={guardar}>Guardar</Btn>
        </div>
      </Dlg>}
    </div>
  );
}

// ── COMUNICACIONES ────────────────────────────────────────────────────────────
const CANAL={tel:{icon:"tel",txt:"Llamada perdida",col:C.rojo,bg:C.rojoClaro},wa:{icon:"msg",txt:"WhatsApp",col:C.verde,bg:C.verdeClaro},bot:{icon:"bot",txt:"Bot cita auto",col:C.azul,bg:C.azulClaro},val:{icon:"star",txt:"Valoracion",col:C.amarillo,bg:C.amarilloClaro}};
const BOT_PASOS=["Hola! Soy el asistente del Taller. En que puedo ayudarte?\n\n1- Pedir cita\n2- Estado de mi coche\n3- Otro","Cual es la matricula de tu vehiculo?","Que servicio necesitas? (ej: cambio aceite, frenos...)","Que dia y hora te viene mejor?","Listo! Cita anotada. Te enviamos confirmacion. Hasta pronto!"];
function Comms({comms,setComms}){
  const [filtro,setFiltro]=useState("all");
  const [botOpen,setBotOpen]=useState(false);
  const [botMsg,setBotMsg]=useState("");
  const [botPaso,setBotPaso]=useState(0);
  const [botConv,setBotConv]=useState([]);
  const marcar=id=>setComms(comms.map(c=>c.id===id?{...c,ok:true}:c));
  const pend=comms.filter(c=>!c.ok).length;
  const lista=filtro==="all"?comms:comms.filter(c=>c.canal===filtro);
  const botEnviar=()=>{
    if(!botMsg.trim())return;
    const conv=[...botConv,{r:"u",t:botMsg}];
    const sig=botPaso+1;
    if(sig<BOT_PASOS.length)conv.push({r:"b",t:BOT_PASOS[sig]});
    if(sig===BOT_PASOS.length-1)setComms(prev=>[{id:Date.now(),canal:"bot",hora:"ahora",nombre:"Nuevo cliente (bot)",num:"-",txt:"Bot: cita solicitada",ok:false},...prev]);
    setBotConv(conv);setBotPaso(sig);setBotMsg("");
  };
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
        <div><div style={{fontSize:17,fontWeight:700,color:C.texto}}>Comunicaciones</div>{pend>0&&<div style={{fontSize:12,color:C.rojo,marginTop:1,fontWeight:600}}>{pend} sin gestionar</div>}</div>
        <Btn v="bl" onClick={()=>{setBotOpen(true);setBotConv([{r:"b",t:BOT_PASOS[0]}]);setBotPaso(0);}}>Demo bot</Btn>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {[["all","Todas"],["tel","Llamadas"],["wa","WhatsApp"],["bot","Bot"],["val","Valoraciones"]].map(([k,l])=>(<button key={k} onClick={()=>setFiltro(k)} style={{background:filtro===k?C.acento:C.plomo,color:filtro===k?"#fff":C.textoSuave,border:`1px solid ${filtro===k?C.acento:C.borde}`,borderRadius:7,padding:"5px 12px",fontSize:12,fontWeight:600,cursor:"pointer"}}>{l}</button>))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {lista.map(com=>{const cfg=CANAL[com.canal]||CANAL.wa;return(
          <div key={com.id} style={{background:C.carbono,border:`1px solid ${!com.ok?C.rojo+"44":C.borde}`,borderRadius:10,padding:"13px 15px",display:"flex",gap:12,alignItems:"flex-start"}}>
            <div style={{flex:1}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3,flexWrap:"wrap"}}>
                <span style={{fontWeight:700,color:C.texto,fontSize:13}}>{com.nombre}</span>
                <span style={{color:C.textoSuave,fontSize:11,fontFamily:"monospace"}}>{com.num}</span>
                <span style={{color:C.textoSuave,fontSize:11}}>{com.hora}</span>
                <Bdg color={cfg.col} bg={cfg.bg} txt={cfg.txt}/>
                {!com.ok&&<span style={{background:C.rojoClaro,color:C.rojo,borderRadius:4,padding:"1px 6px",fontSize:10,fontWeight:700}}>PENDIENTE</span>}
              </div>
              <div style={{color:C.textoSuave,fontSize:12,lineHeight:1.5}}>{com.txt}</div>
            </div>
            <div style={{display:"flex",gap:6,flexShrink:0}}>
              {!com.ok&&<Btn v="gr" sm onClick={()=>marcar(com.id)}>Gestionado</Btn>}
              {com.ok&&<span style={{color:C.verde,fontSize:12,fontWeight:600}}>OK</span>}
            </div>
          </div>
        );})}
      </div>
      {botOpen&&<Dlg title="Simulacion Bot WhatsApp" onClose={()=>setBotOpen(false)} w={420}>
        <div style={{background:C.negro,borderRadius:10,padding:12,minHeight:260,maxHeight:340,overflowY:"auto",marginBottom:12,display:"flex",flexDirection:"column",gap:8}}>
          {botConv.map((m,i)=>(<div key={i} style={{display:"flex",justifyContent:m.r==="b"?"flex-start":"flex-end"}}><div style={{background:m.r==="b"?C.plomo:C.acento,color:C.texto,borderRadius:10,padding:"9px 13px",maxWidth:"82%",fontSize:12,lineHeight:1.6,whiteSpace:"pre-line"}}>{m.r==="b"&&<span style={{fontSize:10,color:C.textoSuave,display:"block",marginBottom:3}}>Bot Taller Perez</span>}{m.t}</div></div>))}
        </div>
        {botPaso<BOT_PASOS.length-1
          ?<div style={{display:"flex",gap:8}}><input value={botMsg} onChange={e=>setBotMsg(e.target.value)} onKeyDown={e=>e.key==="Enter"&&botEnviar()} placeholder="Escribe tu respuesta..." style={{flex:1,background:C.plomo,border:`1px solid ${C.borde}`,borderRadius:7,padding:"8px 11px",color:C.texto,fontSize:13}}/><Btn onClick={botEnviar}>Enviar</Btn></div>
          :<div style={{textAlign:"center",color:C.verde,fontWeight:700,fontSize:13}}>Cita registrada automaticamente</div>}
      </Dlg>}
    </div>
  );
}

// ── CLIENTES ─────────────────────────────────────────────────────────────────
function Clientes({clientes,setClientes}){
  const [q,setQ]          =useState("");
  const [open,setOpen]    =useState(null); // id cliente abierto en ficha
  const [valId,setValId]  =useState(null);
  const [stars,setStars]  =useState(0);
  const [dlgNuevo,setDlgNuevo]=useState(false);
  const [nuevoForm,setNuevoForm]=useState({nombre:"",dni:"",tel:"",modelo:"",matricula:""});

  const lista=clientes.filter(c=>
    (c.nombre||"").toLowerCase().includes(q.toLowerCase())||
    (c.vehiculos||[]).some(v=>(v.matricula||"").toLowerCase().includes(q.toLowerCase()))||
    (c.tel||"").includes(q)
  );
  const det=clientes.find(c=>c.id===open);
  const revsCliente=det?(Array.isArray(det.vehiculos)?det.vehiculos:[]).flatMap(v=>REVISIONES.filter(r=>r.mat===v.matricula)):[];

  const guardarNuevo=()=>{
    if(!nuevoForm.nombre||!nuevoForm.tel)return;
    const nuevo={
      id:Date.now(),
      nombre:nuevoForm.nombre,
      dni:nuevoForm.dni,
      tel:nuevoForm.tel,
      visitas:0,gasto:0,val:null,
      vehiculos:nuevoForm.modelo?[{id:`v${Date.now()}`,modelo:nuevoForm.modelo,matricula:nuevoForm.matricula}]:[],
    };
    setClientes([...clientes,nuevo]);
    setNuevoForm({nombre:"",dni:"",tel:"",modelo:"",matricula:""});
    setDlgNuevo(false);
  };

  const addVehiculo=(cliId)=>{
    const modelo=prompt("Modelo del vehiculo (ej: Ford Focus 2021):");
    if(!modelo)return;
    const mat=prompt("Matricula:");
    if(!mat)return;
    setClientes(clientes.map(c=>c.id===cliId?{...c,vehiculos:[...Array.isArray(c.vehiculos)?c.vehiculos:[],{id:`v${Date.now()}`,modelo,matricula:mat}]}:c));
  };

  const delVehiculo=(cliId,vId)=>{
    setClientes(clientes.map(c=>c.id===cliId?{...c,vehiculos:(Array.isArray(c.vehiculos)?c.vehiculos:[]).filter(v=>v.id!==vId)}:c));
  };

  return(
    <div>
      {/* Cabecera */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,gap:8,flexWrap:"wrap"}}>
        <div style={{fontSize:17,fontWeight:700,color:C.texto}}>Clientes <span style={{color:C.textoSuave,fontSize:13,fontWeight:400}}>({clientes.length})</span></div>
        <div style={{display:"flex",gap:8}}>
          <input placeholder="Buscar nombre, matricula o tel..." value={q} onChange={e=>setQ(e.target.value)}
            style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:8,padding:"8px 13px",color:C.texto,fontSize:13,width:230}}/>
          <Btn onClick={()=>setDlgNuevo(true)}>+ Nuevo cliente</Btn>
        </div>
      </div>

      {/* Lista */}
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {lista.map(c=>{
          const nveh=(c.vehiculos||[]).length;
          return(
            <div key={c.id} onClick={()=>setOpen(c.id)}
              style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:10,padding:"13px 17px",display:"flex",alignItems:"center",gap:13,flexWrap:"wrap",cursor:"pointer"}}
              onMouseEnter={e=>e.currentTarget.style.borderColor=C.acento+"55"}
              onMouseLeave={e=>e.currentTarget.style.borderColor=C.borde}>
              {/* Avatar */}
              <div style={{width:40,height:40,borderRadius:"50%",background:C.acentoSuave,border:`1.5px solid ${C.acento}40`,display:"flex",alignItems:"center",justifyContent:"center",color:C.acento,fontWeight:800,fontSize:16,flexShrink:0,position:"relative"}}>
                {(c.nombre||"?")[0]}
                {/* Contador de coches */}
                {nveh>0&&<div style={{position:"absolute",top:-4,right:-4,background:C.azul,color:"#fff",borderRadius:"50%",width:16,height:16,fontSize:9,fontWeight:800,display:"flex",alignItems:"center",justifyContent:"center",border:`2px solid ${C.carbono}`}}>{nveh}</div>}
              </div>
              {/* Info */}
              <div style={{flex:1,minWidth:150}}>
                <div style={{fontWeight:700,color:C.texto,fontSize:14}}>{c.nombre||""}</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap",marginTop:3}}>
                  {(c.vehiculos||[]).map((v,i)=>(
                    <span key={i} style={{background:C.plomo,border:`1px solid ${C.borde}`,borderRadius:4,padding:"1px 7px",fontSize:10,color:C.textoSuave,fontFamily:"monospace"}}>{v.matricula}</span>
                  ))}
                  {nveh===0&&<span style={{color:C.textoSuave,fontSize:11}}>Sin vehiculos</span>}
                </div>
              </div>
              {/* Stats */}
              <div style={{display:"flex",gap:16,flexShrink:0}}>
                <div style={{textAlign:"center"}}>
                  <div style={{fontWeight:800,color:C.azul,fontFamily:"monospace",fontSize:15}}>{nveh}</div>
                  <div style={{color:C.textoSuave,fontSize:10}}>coches</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontWeight:800,color:C.texto,fontFamily:"monospace"}}>{c.visitas||0}</div>
                  <div style={{color:C.textoSuave,fontSize:10}}>visitas</div>
                </div>
                <div style={{textAlign:"center"}}>
                  <div style={{fontWeight:800,color:C.verde,fontFamily:"monospace",fontSize:13}}>{fmtEur(c.gasto||0)}</div>
                  <div style={{color:C.textoSuave,fontSize:10}}>gastado</div>
                </div>
              </div>
              {/* Estrellas */}
              {c.val&&<div style={{display:"flex",gap:1,flexShrink:0}}>{[1,2,3,4,5].map(i=><span key={i} style={{fontSize:13,color:i<=c.val?C.amarillo:C.borde}}>&#9733;</span>)}</div>}
              <div style={{color:C.textoSuave,fontSize:11,flexShrink:0}}>Ver ficha ›</div>
            </div>
          );
        })}
        {lista.length===0&&<div style={{textAlign:"center",color:C.textoSuave,padding:"40px 0",fontSize:13}}>No hay clientes con esa busqueda</div>}
      </div>

      {/* ── FICHA COMPLETA ── */}
      {det&&(
        <Dlg title="" onClose={()=>setOpen(null)} w={580}>
          {/* Cabecera ficha */}
          <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${C.borde}`}}>
            <div style={{width:56,height:56,borderRadius:"50%",background:C.acentoSuave,border:`2px solid ${C.acento}40`,display:"flex",alignItems:"center",justifyContent:"center",color:C.acento,fontWeight:800,fontSize:22,flexShrink:0}}>
              {(det.nombre||"?")[0]}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:18,fontWeight:800,color:C.texto}}>{det.nombre||""}</div>
              <div style={{display:"flex",gap:12,marginTop:4,flexWrap:"wrap"}}>
                <span style={{color:C.textoSuave,fontSize:12}}>📞 {det.tel}</span>
                {det.dni&&<span style={{color:C.textoSuave,fontSize:12,fontFamily:"monospace"}}>DNI: {det.dni}</span>}
              </div>
              {det.val&&<div style={{display:"flex",gap:2,marginTop:4}}>{[1,2,3,4,5].map(i=><span key={i} style={{fontSize:16,color:i<=det.val?C.amarillo:C.borde}}>&#9733;</span>)}</div>}
            </div>
            <div style={{display:"flex",gap:8}}>
              <Btn v="yw" sm onClick={e=>{e.stopPropagation();setValId(det.id);setStars(det.val||0);}}>Valorar</Btn>
              <a href={`tel:${det.tel}`} onClick={e=>e.stopPropagation()} style={{background:C.verdeClaro,border:`1px solid ${C.verde}40`,color:C.verde,borderRadius:7,padding:"4px 10px",fontSize:11,fontWeight:700,textDecoration:"none"}}>Llamar</a>
            </div>
          </div>

          {/* KPIs */}
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:18}}>
            {[
              {val:(det.vehiculos||[]).length,label:"Vehiculos",color:C.azul},
              {val:det.visitas,label:"Visitas",color:C.texto},
              {val:fmtEur(det.gasto),label:"Total gastado",color:C.verde},
            ].map((k,i)=>(
              <div key={i} style={{background:C.plomo,borderRadius:9,padding:"12px 14px",textAlign:"center"}}>
                <div style={{fontFamily:"monospace",fontWeight:800,fontSize:17,color:k.color}}>{k.val}</div>
                <div style={{color:C.textoSuave,fontSize:11,marginTop:2}}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Vehiculos */}
          <Hr label="Vehiculos"/>
          <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:4}}>
            {(Array.isArray(det.vehiculos)?det.vehiculos:[]).map(v=>{
              const revsV=REVISIONES.filter(r=>r.mat===v.matricula);
              return(
                <div key={v.id} style={{background:C.plomo,borderRadius:9,padding:"11px 14px",display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:20}}>🚗</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,color:C.texto,fontSize:13}}>{v.modelo}</div>
                    <div style={{fontFamily:"monospace",fontSize:11,color:C.acento,marginTop:1}}>{v.matricula}</div>
                    <div style={{color:C.textoSuave,fontSize:11,marginTop:1}}>{revsV.length} revision{revsV.length!==1?"es":""} registradas</div>
                  </div>
                  <button onClick={()=>delVehiculo(det.id,v.id)}
                    style={{background:"none",border:`1px solid ${C.rojo}40`,color:C.rojo,borderRadius:6,padding:"4px 8px",fontSize:11,cursor:"pointer"}}>
                    Quitar
                  </button>
                </div>
              );
            })}
            <button onClick={()=>addVehiculo(det.id)}
              style={{background:"none",border:`1px dashed ${C.borde}`,borderRadius:8,padding:"9px",color:C.textoSuave,fontSize:12,cursor:"pointer",textAlign:"center"}}>
              + Anadir vehiculo
            </button>
          </div>

          {/* Revisiones */}
          {revsCliente.length>0&&(
            <>
              <Hr label="Historial de revisiones"/>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {revsCliente.map((r,i)=>(
                  <div key={i} style={{background:C.plomo,borderRadius:8,padding:"9px 13px",display:"flex",alignItems:"center",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{color:C.texto,fontSize:12,fontWeight:600}}>{r.srv}</div>
                      <div style={{color:C.textoSuave,fontSize:11,marginTop:2}}>{r.fecha} · {r.km.toLocaleString()} km · {r.mec} · <span style={{fontFamily:"monospace"}}>{r.mat}</span></div>
                    </div>
                    <div style={{color:C.verde,fontFamily:"monospace",fontWeight:700,fontSize:13}}>{fmtEur(r.imp)}</div>
                  </div>
                ))}
              </div>
            </>
          )}
          {revsCliente.length===0&&<div style={{color:C.textoSuave,fontSize:12,textAlign:"center",padding:"16px 0"}}>Sin revisiones registradas</div>}
        </Dlg>
      )}

      {/* ── MODAL NUEVO CLIENTE ── */}
      {dlgNuevo&&(
        <Dlg title="Nuevo cliente" onClose={()=>setDlgNuevo(false)} w={420}>
          <Inp label="Nombre completo" val={nuevoForm.nombre} set={v=>setNuevoForm({...nuevoForm,nombre:v})} ph="Nombre y apellidos"/>
          <Inp label="Telefono" val={nuevoForm.tel} set={v=>setNuevoForm({...nuevoForm,tel:v})} ph="6XX XXX XXX"/>
          <Inp label="DNI / NIE (opcional)" val={nuevoForm.dni} set={v=>setNuevoForm({...nuevoForm,dni:v})} ph="12345678A"/>
          <Hr label="Vehiculo (opcional)"/>
          <Inp label="Modelo" val={nuevoForm.modelo} set={v=>setNuevoForm({...nuevoForm,modelo:v})} ph="Marca Modelo Anyo"/>
          <Inp label="Matricula" val={nuevoForm.matricula} set={v=>setNuevoForm({...nuevoForm,matricula:v})} ph="0000 XXX"/>
          <div style={{display:"flex",gap:8,marginTop:8}}>
            <Btn v="gh" onClick={()=>setDlgNuevo(false)}>Cancelar</Btn>
            <Btn onClick={guardarNuevo}>Guardar cliente</Btn>
          </div>
        </Dlg>
      )}

      {/* ── MODAL VALORACION ── */}
      {valId&&(
        <Dlg title="Registrar valoracion" onClose={()=>setValId(null)} w={360}>
          <div style={{textAlign:"center",marginBottom:14}}>
            <div style={{color:C.textoSuave,fontSize:13,marginBottom:10}}>Puntuacion del cliente</div>
            <div style={{display:"flex",justifyContent:"center",gap:6}}>{[1,2,3,4,5].map(i=><span key={i} onClick={()=>setStars(i)} style={{fontSize:30,cursor:"pointer",color:i<=stars?C.amarillo:C.borde}}>&#9733;</span>)}</div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:6}}>
            <Btn v="gh" onClick={()=>setValId(null)}>Cancelar</Btn>
            <Btn onClick={()=>{setClientes(clientes.map(c=>c.id===valId?{...c,val:stars}:c));setValId(null);}}>Guardar</Btn>
          </div>
        </Dlg>
      )}
    </div>
  );
}

// ── ALBARANES ────────────────────────────────────────────────────────────────
function Albaranes({albs,setAlbs,setFacts,setTab}){
  const [dlgNuevo,setDlgNuevo]=useState(false);
  const [open,setOpen]        =useState(null);
  const [editMode,setEditMode]=useState(false);
  const [motivo,setMotivo]    =useState("");
  const [rechazando,setRechazando]=useState(false);

  // form nuevo albaran
  const [form,setForm]=useState({cliente:"",veh:"",mat:"",mec:"Paco",nota:"",dtoGlobal:""});
  const [lineas,setLineas]=useState([{id:1,desc:"",tipo:"pieza",precio:"",qty:1,dto:0}]);
  const addL  =()=>setLineas(prev=>[...prev,{id:Date.now(),desc:"",tipo:"pieza",precio:"",qty:1,dto:0}]);
  const updL  =(id,k,v)=>setLineas(prev=>prev.map(l=>l.id===id?{...l,[k]:v}:l));
  const delL  =id=>setLineas(prev=>prev.filter(l=>l.id!==id));

  // form editar albaran existente
  const [eLineas,setELineas]      =useState([]);
  const [eDtoGlobal,setEDtoGlobal]=useState(0);
  const [eNota,setENota]          =useState("");
  const addEL=()=>setELineas(prev=>[...prev,{id:Date.now(),desc:"",tipo:"pieza",precio:0,qty:1,dto:0}]);
  const updEL=(id,k,v)=>setELineas(prev=>prev.map(l=>l.id===id?{...l,[k]:v}:l));
  const delEL=id=>setELineas(prev=>prev.filter(l=>l.id!==id));

  const abrirEdicion=a=>{
    setELineas(a.lineas.map(l=>({...l})));
    setEDtoGlobal(a.dtoGlobal||0);
    setENota(a.nota||"");
    setEditMode(true);
  };

  const guardarEdicion=id=>{
    setAlbs(prev=>prev.map(a=>a.id!==id?a:{...a,
      lineas:eLineas.map(l=>({...l,precio:parseFloat(l.precio)||0,qty:parseInt(l.qty)||1,dto:parseFloat(l.dto)||0})),
      dtoGlobal:parseFloat(eDtoGlobal)||0,nota:eNota,
    }));
    setEditMode(false);
  };

  const guardar=()=>{
    if(!form.cliente)return;
    setAlbs(prev=>[{
      id:`ALB-${String(prev.length+3).padStart(3,"0")}`,
      cliente:form.cliente,veh:form.veh,mat:form.mat,mec:form.mec,
      nota:form.nota,fecha:"ahora",estado:"pendiente",
      dtoGlobal:parseFloat(form.dtoGlobal)||0,
      lineas:lineas.map(l=>({...l,precio:parseFloat(l.precio)||0,qty:parseInt(l.qty)||1,dto:parseFloat(l.dto)||0})),
    },...prev]);
    setForm({cliente:"",veh:"",mat:"",mec:"Paco",nota:"",dtoGlobal:""});
    setLineas([{id:1,desc:"",tipo:"pieza",precio:"",qty:1,dto:0}]);
    setDlgNuevo(false);
  };

  const aprobar=a=>{
    const num=`F-2024-${String(90+albs.filter(x=>x.estado==="aprobado").length+1).padStart(3,"0")}`;
    const factor=1-(parseFloat(a.dtoGlobal)||0)/100;
    setFacts(prev=>[{id:num,cliente:a.cliente,
      servicios:a.lineas.map((l,i)=>({id:i+1,desc:l.desc+(l.qty>1?` x${l.qty}`:""),precio:parseFloat((lineaNeta(l)*factor).toFixed(2))})),
      estado:"pendiente",aviso:false},...prev]);
    setAlbs(prev=>prev.map(x=>x.id===a.id?{...x,estado:"aprobado",fid:num}:x));
    setOpen(null);setTimeout(()=>setTab("facturas"),400);
  };

  const rechazar=id=>{
    setAlbs(prev=>prev.map(a=>a.id===id?{...a,estado:"rechazado",motivo}:a));
    setMotivo("");setRechazando(false);setOpen(null);
  };

  const pend=albs.filter(a=>a.estado==="pendiente");
  const det =albs.find(a=>a.id===open);
  const EC={
    pendiente:{txt:"Pendiente aprobacion",col:C.amarillo,bg:C.amarilloClaro},
    aprobado: {txt:"Aprobado - Facturado",col:C.verde,   bg:C.verdeClaro},
    rechazado:{txt:"Rechazado",           col:C.rojo,    bg:C.rojoClaro},
  };

  // Resumen de totales reutilizable
  const Resumen=({ls,dtoG})=>{
    const ls2=ls.map(l=>({...l,precio:parseFloat(l.precio)||0,qty:parseInt(l.qty)||1,dto:parseFloat(l.dto)||0}));
    const bruto=ls2.reduce((s,l)=>s+l.precio*l.qty,0);
    const subL =ls2.reduce((s,l)=>s+lineaNeta(l),0);
    const dG   =parseFloat(dtoG)||0;
    const total=subL*(1-dG/100);
    const hayDL=ls2.some(l=>l.dto>0);
    return(
      <div style={{background:C.plomo,borderRadius:9,padding:"11px 15px",marginBottom:12}}>
        {(hayDL||dG>0)&&<div style={{display:"flex",justifyContent:"space-between",color:C.textoSuave,fontSize:12,marginBottom:4}}><span>Bruto</span><span style={{fontFamily:"monospace"}}>{fmtEur(bruto)}</span></div>}
        {hayDL&&<div style={{display:"flex",justifyContent:"space-between",color:C.rojo,fontSize:12,marginBottom:4}}><span>Dto. por lineas</span><span style={{fontFamily:"monospace"}}>-{fmtEur(bruto-subL)}</span></div>}
        {dG>0&&<div style={{display:"flex",justifyContent:"space-between",color:C.rojo,fontSize:12,marginBottom:4}}><span>Dto. global ({dG}%)</span><span style={{fontFamily:"monospace"}}>-{fmtEur(subL*dG/100)}</span></div>}
        {(hayDL||dG>0)&&<div style={{height:1,background:C.borde,margin:"5px 0"}}/>}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:C.texto,fontWeight:700,fontSize:14}}>Total</span>
          <span style={{fontFamily:"monospace",fontWeight:800,fontSize:18,color:C.texto}}>{fmtEur(total)}</span>
        </div>
      </div>
    );
  };

  // Grid de lineas editable reutilizable
  const GridLineas=({ls,addFn,updFn,delFn})=>(
    <div style={{marginBottom:4}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 85px 44px 75px 60px 24px",gap:5,marginBottom:4,padding:"0 2px"}}>
        {["Descripcion","Tipo","Qty","Precio","Dto %",""].map((h,i)=>(
          <div key={i} style={{color:C.textoSuave,fontSize:10,fontWeight:600,textTransform:"uppercase"}}>{h}</div>
        ))}
      </div>
      {ls.map(l=>(
        <div key={l.id} style={{display:"grid",gridTemplateColumns:"1fr 85px 44px 75px 60px 24px",gap:5,marginBottom:5,alignItems:"center"}}>
          <input value={l.desc} onChange={e=>updFn(l.id,"desc",e.target.value)} placeholder="Descripcion"
            style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:6,padding:"7px 9px",color:C.texto,fontSize:12}}/>
          <select value={l.tipo} onChange={e=>updFn(l.id,"tipo",e.target.value)}
            style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:6,padding:"7px 5px",color:C.textoSuave,fontSize:12}}>
            <option value="pieza">Pieza</option><option value="trabajo">Trabajo</option><option value="otro">Otro</option>
          </select>
          <input type="number" value={l.qty} onChange={e=>updFn(l.id,"qty",e.target.value)} placeholder="1"
            style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:6,padding:"7px 5px",color:C.texto,fontSize:12,textAlign:"center"}}/>
          <input type="number" value={l.precio} onChange={e=>updFn(l.id,"precio",e.target.value)} placeholder="0.00"
            style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:6,padding:"7px 7px",color:C.texto,fontSize:12,textAlign:"right"}}/>
          <div style={{position:"relative"}}>
            <input type="number" min="0" max="100" value={l.dto} onChange={e=>updFn(l.id,"dto",e.target.value)} placeholder="0"
              style={{background:parseFloat(l.dto)>0?C.rojoClaro:C.carbono,border:`1px solid ${parseFloat(l.dto)>0?C.rojo+"60":C.borde}`,borderRadius:6,padding:"7px 18px 7px 7px",color:parseFloat(l.dto)>0?C.rojo:C.texto,fontSize:12,textAlign:"right",width:"100%",boxSizing:"border-box"}}/>
            <span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",color:C.textoSuave,fontSize:11}}>%</span>
          </div>
          <button onClick={()=>delFn(l.id)} style={{background:"none",border:"none",color:C.rojo,fontSize:15,cursor:"pointer"}}>x</button>
        </div>
      ))}
      <button onClick={addFn} style={{background:"none",border:`1px dashed ${C.borde}`,borderRadius:6,padding:"5px 13px",color:C.textoSuave,fontSize:12,cursor:"pointer",width:"100%",marginBottom:8}}>+ Anadir linea</button>
    </div>
  );

  const BloqueDtoGlobal=({val,set})=>(
    <div style={{background:C.plomo,borderRadius:8,padding:"10px 13px",marginBottom:10,display:"flex",alignItems:"center",gap:12}}>
      <div style={{flex:1}}>
        <div style={{color:C.texto,fontSize:13,fontWeight:600}}>Descuento global sobre el total</div>
        <div style={{color:C.textoSuave,fontSize:11}}>Se aplica sobre el subtotal ya descontado por linea</div>
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6}}>
        <input type="number" min="0" max="100" value={val} onChange={e=>set(e.target.value)} placeholder="0"
          style={{background:parseFloat(val)>0?C.rojoClaro:C.carbono,border:`1px solid ${parseFloat(val)>0?C.rojo+"60":C.borde}`,borderRadius:6,padding:"7px 10px",color:parseFloat(val)>0?C.rojo:C.texto,fontSize:14,fontWeight:700,width:60,textAlign:"right"}}/>
        <span style={{color:C.textoSuave,fontWeight:600}}>%</span>
      </div>
    </div>
  );

  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,color:C.texto}}>Albaranes</div>
          <div style={{fontSize:12,color:C.textoSuave,marginTop:1}}>Mecanico registra - dueno aprueba</div>
        </div>
        <Btn onClick={()=>setDlgNuevo(true)}>+ Registrar trabajo</Btn>
      </div>

      {pend.length>0&&<div style={{background:C.amarilloClaro,border:`1px solid ${C.amarillo}50`,borderRadius:10,padding:"9px 15px",marginBottom:14,color:C.amarillo,fontWeight:600,fontSize:13}}>{pend.length} esperando aprobacion</div>}

      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {albs.map(a=>{
          const e=EC[a.estado]||EC.pendiente;
          return(
            <div key={a.id} onClick={()=>{setOpen(a.id);setEditMode(false);setRechazando(false);setMotivo("");}}
              style={{background:C.carbono,border:`1px solid ${a.estado==="pendiente"?C.amarillo+"55":C.borde}`,borderRadius:10,padding:"13px 17px",display:"flex",alignItems:"center",gap:13,cursor:"pointer",flexWrap:"wrap"}}>
              <div style={{fontFamily:"monospace",fontSize:11,color:C.textoSuave,flexShrink:0,width:70}}>{a.id}</div>
              <div style={{flex:1,minWidth:150}}>
                <div style={{fontWeight:700,color:C.texto,fontSize:13}}>{a.cliente}</div>
                <div style={{color:C.textoSuave,fontSize:12}}>{a.veh} - {a.mec} - {a.fecha}</div>
              </div>
              <div style={{fontFamily:"monospace",fontWeight:800,fontSize:14,color:C.texto,flexShrink:0}}>{fmtEur(totalAlbConDto(a.lineas,a.dtoGlobal))}</div>
              <Bdg color={e.col} bg={e.bg} txt={e.txt}/>
            </div>
          );
        })}
      </div>

      {/* MODAL DETALLE */}
      {det&&(
        <Dlg title={editMode?`Editando ${det.id}`:`Albaran ${det.id}`} onClose={()=>{setOpen(null);setEditMode(false);setRechazando(false);setMotivo("");}} w={600}>

          {/* Cabecera (solo en vista) */}
          {!editMode&&(
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <div style={{flex:1}}><div style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Cliente</div><div style={{color:C.texto,fontWeight:700}}>{det.cliente}</div></div>
              <div style={{flex:1}}><div style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Vehiculo</div><div style={{color:C.texto}}>{det.veh} - <span style={{fontFamily:"monospace"}}>{det.mat}</span></div></div>
              <div><div style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase"}}>Mecanico</div><div style={{color:C.texto}}>{det.mec}</div></div>
            </div>
          )}

          {/* MODO VISTA */}
          {!editMode&&(
            <>
              <div style={{background:C.plomo,borderRadius:8,overflow:"hidden",marginBottom:10}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 70px 44px 50px 90px",padding:"7px 12px",borderBottom:`1px solid ${C.borde}`,gap:6}}>
                  {["Descripcion","Tipo","Qty","Dto","Subtotal"].map(h=><div key={h} style={{color:C.textoSuave,fontSize:10,fontWeight:600,textTransform:"uppercase"}}>{h}</div>)}
                </div>
                {det.lineas.map((l,i)=>{
                  const neta=lineaNeta(l);const bruta=l.precio*l.qty;const ahorro=bruta-neta;
                  return(
                    <div key={l.id} style={{display:"grid",gridTemplateColumns:"1fr 70px 44px 50px 90px",padding:"10px 12px",borderBottom:i<det.lineas.length-1?`1px solid ${C.borde}`:"none",gap:6,alignItems:"center"}}>
                      <div style={{color:C.texto,fontSize:12}}>{l.desc}</div>
                      <div><span style={{fontSize:10,background:l.tipo==="pieza"?C.azulClaro:C.verdeClaro,color:l.tipo==="pieza"?C.azul:C.verde,borderRadius:4,padding:"2px 5px"}}>{l.tipo}</span></div>
                      <div style={{color:C.textoSuave,fontSize:12,textAlign:"center"}}>x{l.qty}</div>
                      <div>{l.dto>0?<span style={{background:C.rojoClaro,color:C.rojo,fontSize:11,fontWeight:700,borderRadius:4,padding:"2px 6px"}}>-{l.dto}%</span>:<span style={{color:C.textoSuave,fontSize:11}}>-</span>}</div>
                      <div style={{textAlign:"right"}}>
                        <div style={{color:C.texto,fontFamily:"monospace",fontSize:13,fontWeight:700}}>{fmtEur(neta)}</div>
                        {ahorro>0&&<div style={{color:C.textoSuave,fontSize:10,textDecoration:"line-through"}}>{fmtEur(bruta)}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <Resumen ls={det.lineas} dtoG={det.dtoGlobal}/>
              {det.nota&&<div style={{background:C.acentoSuave,border:`1px solid ${C.acento}30`,borderRadius:8,padding:"9px 13px",marginBottom:12}}><div style={{color:C.acento,fontSize:11,fontWeight:700,marginBottom:3}}>NOTA DEL MECANICO</div><div style={{color:C.texto,fontSize:12}}>{det.nota}</div></div>}
              {det.estado==="pendiente"&&(
                rechazando
                  ?<div><Inp label="Motivo del rechazo" val={motivo} set={setMotivo} ph="Ej: falta la mano de obra..."/><div style={{display:"flex",gap:8}}><Btn v="gh" onClick={()=>setRechazando(false)}>Cancelar</Btn><Btn v="rd" onClick={()=>rechazar(det.id)}>Confirmar rechazo</Btn></div></div>
                  :<div style={{display:"flex",gap:8,justifyContent:"space-between",alignItems:"center"}}>
                    <Btn v="bl" onClick={()=>abrirEdicion(det)}>Editar albaran</Btn>
                    <div style={{display:"flex",gap:8}}>
                      <Btn v="rd" onClick={()=>setRechazando(true)}>Rechazar</Btn>
                      <Btn v="gr" onClick={()=>aprobar(det)}>Aprobar y facturar</Btn>
                    </div>
                  </div>
              )}
              {det.estado==="aprobado"&&<div style={{textAlign:"center",color:C.verde,fontWeight:700,padding:"8px 0"}}>Aprobado - Factura {det.fid} generada</div>}
              {det.estado==="rechazado"&&<div style={{background:C.rojoClaro,border:`1px solid ${C.rojo}40`,borderRadius:8,padding:"10px 13px"}}><div style={{color:C.rojo,fontWeight:700}}>Rechazado</div>{det.motivo&&<div style={{color:C.texto,fontSize:12,marginTop:3}}>{det.motivo}</div>}</div>}
            </>
          )}

          {/* MODO EDICION */}
          {editMode&&(
            <>
              <GridLineas ls={eLineas} addFn={addEL} updFn={updEL} delFn={delEL}/>
              <BloqueDtoGlobal val={eDtoGlobal} set={setEDtoGlobal}/>
              <Resumen ls={eLineas} dtoG={eDtoGlobal}/>
              <Inp label="Nota" val={eNota} set={setENota} ph="Observaciones para el dueno..."/>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <Btn v="gh" onClick={()=>setEditMode(false)}>Cancelar</Btn>
                <Btn onClick={()=>guardarEdicion(det.id)}>Guardar cambios</Btn>
              </div>
            </>
          )}
        </Dlg>
      )}

      {/* MODAL NUEVO ALBARAN */}
      {dlgNuevo&&(
        <Dlg title="Registrar trabajo" onClose={()=>setDlgNuevo(false)} w={600}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
            <Inp label="Cliente"   val={form.cliente} set={v=>setForm({...form,cliente:v})} ph="Nombre"/>
            <Inp label="Matricula" val={form.mat}     set={v=>setForm({...form,mat:v})}     ph="0000 XXX"/>
            <Inp label="Vehiculo"  val={form.veh}     set={v=>setForm({...form,veh:v})}     ph="Marca Modelo Anyo"/>
            <Inp label="Mecanico"  val={form.mec}     set={v=>setForm({...form,mec:v})}     ph="Tu nombre"/>
          </div>
          <GridLineas ls={lineas} addFn={addL} updFn={updL} delFn={delL}/>
          <BloqueDtoGlobal val={form.dtoGlobal} set={v=>setForm({...form,dtoGlobal:v})}/>
          <Resumen ls={lineas} dtoG={form.dtoGlobal}/>
          <Inp label="Nota para el dueno" val={form.nota} set={v=>setForm({...form,nota:v})} ph="Algo que deba saber antes de aprobar..."/>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end",marginTop:4}}>
            <Btn v="gh" onClick={()=>setDlgNuevo(false)}>Cancelar</Btn>
            <Btn onClick={guardar}>Enviar para aprobacion</Btn>
          </div>
        </Dlg>
      )}
    </div>
  );
}


// ── FACTURAS ──────────────────────────────────────────────────────────────────

// ── GENERADOR PDF ─────────────────────────────────────────────────────────────
function generarPDF(f){
  const pdoc = new jsPDF({unit:"mm",format:"a4"});
  const W=210, mg=20;
  let y=20;
  const gris1=[26,26,26], gris2=[42,42,42], naranja=[255,107,0];
  const blanco=[240,240,240], suave=[136,136,136];

  // Fondo
  pdoc.setFillColor(...gris1); pdoc.rect(0,0,W,297,"F");

  // Cabecera naranja
  pdoc.setFillColor(...naranja); pdoc.rect(0,0,W,28,"F");
  pdoc.setTextColor(255,255,255);
  pdoc.setFontSize(18); pdoc.setFont("helvetica","bold");
  pdoc.text("TALLER PEREZ",mg,13);
  pdoc.setFontSize(9); pdoc.setFont("helvetica","normal");
  pdoc.text("Av. de la Mecanica 47 · Valladolid · Tel: 983 000 000",mg,20);
  pdoc.text(f.id, W-mg, 12, {align:"right"});
  pdoc.text("Fecha: "+new Date().toLocaleDateString("es-ES"), W-mg, 19, {align:"right"});
  y=40;

  // Bloque cliente
  pdoc.setFillColor(...gris2); pdoc.roundedRect(mg,y,W-mg*2,22,2,2,"F");
  pdoc.setTextColor(...suave); pdoc.setFontSize(8); pdoc.setFont("helvetica","bold");
  pdoc.text("CLIENTE",mg+5,y+7);
  pdoc.setTextColor(...blanco); pdoc.setFontSize(11); pdoc.setFont("helvetica","bold");
  pdoc.text(f.cliente,mg+5,y+15);
  y+=30;

  // Cabecera tabla
  pdoc.setFillColor(...naranja); pdoc.rect(mg,y,W-mg*2,7,"F");
  pdoc.setTextColor(255,255,255); pdoc.setFontSize(8); pdoc.setFont("helvetica","bold");
  pdoc.text("DESCRIPCION",mg+3,y+5);
  pdoc.text("IMPORTE",W-mg-3,y+5,{align:"right"});
  y+=7;

  // Lineas
  f.servicios.forEach((l,i)=>{
    pdoc.setFillColor(i%2===0?30:38,i%2===0?30:38,i%2===0?30:38);
    pdoc.rect(mg,y,W-mg*2,8,"F");
    pdoc.setTextColor(...blanco); pdoc.setFontSize(9); pdoc.setFont("helvetica","normal");
    pdoc.text(l.desc,mg+3,y+5.5);
    pdoc.text(l.precio.toFixed(2).replace(".",",")+" EUR",W-mg-3,y+5.5,{align:"right"});
    y+=8;
  });

  // Total
  y+=4;
  pdoc.setFillColor(...naranja); pdoc.roundedRect(mg,y,W-mg*2,12,2,2,"F");
  pdoc.setTextColor(255,255,255); pdoc.setFontSize(12); pdoc.setFont("helvetica","bold");
  pdoc.text("TOTAL",mg+5,y+8);
  const tot=f.servicios.reduce((s,l)=>s+l.precio,0);
  pdoc.text(tot.toFixed(2).replace(".",",")+" EUR",W-mg-5,y+8,{align:"right"});
  y+=20;

  // Nota IVA
  pdoc.setTextColor(...suave); pdoc.setFontSize(7); pdoc.setFont("helvetica","normal");
  pdoc.text("* Precios sin IVA. IVA (21%) no incluido salvo indicacion expresa.",mg,y);

  // Pie
  pdoc.setFillColor(...gris2); pdoc.rect(0,275,W,22,"F");
  pdoc.setTextColor(...suave); pdoc.setFontSize(7);
  pdoc.text("Taller Perez · CIF: B-00000000 · Av. de la Mecanica 47, 47001 Valladolid",W/2,283,{align:"center"});
  pdoc.text("tallerperezvlld@gmail.com · www.tallerperez.es",W/2,289,{align:"center"});

  pdoc.save("Factura_"+f.id+".pdf");
}


function Facturas({facts,setFacts}){
  const [dlg,setDlg]=useState(false);
  const [nv,setNv]=useState({cliente:"",srv:"",imp:""});
  const marcar=id=>setFacts(facts.map(f=>f.id===id?{...f,estado:"pagada"}:f));
  const avisar=id=>setFacts(facts.map(f=>f.id===id?{...f,aviso:true}:f));
  const pend=facts.filter(f=>f.estado==="pendiente");
  const totPend=pend.reduce((s,f)=>s+totalFac(f),0);
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:pend.length?8:18}}>
        <div>
          <div style={{fontSize:17,fontWeight:700,color:C.texto}}>Facturas</div>
          <div style={{fontSize:12,color:C.textoSuave,marginTop:2}}>Los precios ya incluyen los descuentos aplicados en el albaran</div>
        </div>
        <Btn onClick={()=>setDlg(true)}>+ Factura manual</Btn>
      </div>
      {pend.length>0&&<div style={{background:C.amarilloClaro,border:`1px solid ${C.amarillo}50`,borderRadius:10,padding:"9px 15px",marginBottom:14,color:C.amarillo,fontWeight:600,fontSize:13}}>{pend.length} sin cobrar - {fmtEur(totPend)}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {facts.map(f=>{
          const tot=totalFac(f);
          return(
            <div key={f.id} style={{background:C.carbono,border:`1px solid ${f.estado==="pendiente"?C.amarillo+"44":C.borde}`,borderRadius:10,padding:"13px 17px",display:"flex",alignItems:"center",gap:11,flexWrap:"wrap"}}>
              <div style={{fontFamily:"monospace",fontSize:11,color:C.textoSuave,flexShrink:0,width:86}}>{f.id}</div>
              <div style={{flex:1,minWidth:130}}>
                <div style={{fontWeight:700,color:C.texto,fontSize:13}}>{f.cliente}</div>
                <div style={{color:C.textoSuave,fontSize:12}}>{f.servicios.map(s=>s.desc).join(" - ")}</div>
              </div>
              <div style={{fontFamily:"monospace",fontWeight:800,fontSize:15,color:C.texto,flexShrink:0}}>{fmtEur(tot)}</div>
              <div style={{flexShrink:0}}>{f.aviso?<span style={{color:C.verde,fontSize:11,fontWeight:600}}>Avisado</span>:<Btn v="mo" sm onClick={()=>avisar(f.id)}>Avisar cliente</Btn>}</div>
              <div style={{flexShrink:0}}>{f.estado==="pagada"?<span style={{color:C.verde,fontSize:12,fontWeight:700}}>Pagada</span>:<Btn v="yw" sm onClick={()=>marcar(f.id)}>Cobrada</Btn>}</div>
              <Btn v="gh" sm onClick={()=>generarPDF(f)}>PDF</Btn>
            </div>
          );
        })}
      </div>
      {dlg&&<Dlg title="Nueva factura manual" onClose={()=>setDlg(false)} w={390}>
        <Inp label="Cliente" val={nv.cliente} set={v=>setNv({...nv,cliente:v})} ph="Nombre del cliente"/>
        <Inp label="Servicio" val={nv.srv} set={v=>setNv({...nv,srv:v})} ph="Descripcion"/>
        <Inp label="Importe" type="number" val={nv.imp} set={v=>setNv({...nv,imp:v})} ph="240"/>
        <div style={{fontSize:11,color:C.textoSuave,marginBottom:10,lineHeight:1.5}}>Los descuentos se aplican en el albaran antes de generar la factura. Esta opcion es solo para facturas sin albaran previo.</div>
        <div style={{display:"flex",gap:8,marginTop:6}}>
          <Btn v="gh" onClick={()=>setDlg(false)}>Cancelar</Btn>
          <Btn onClick={()=>{if(!nv.cliente)return;const num=`F-2024-${String(90+facts.length+1).padStart(3,"0")}`;setFacts([{id:num,cliente:nv.cliente,servicios:[{id:1,desc:nv.srv,precio:parseFloat(nv.imp)||0}],estado:"pendiente",aviso:false},...facts]);setNv({cliente:"",srv:"",imp:""});setDlg(false);}}>Crear</Btn>
        </div>
      </Dlg>}
    </div>
  );
}

const EP={
  solicitado:{txt:"Solicitado",col:C.amarillo,bg:C.amarilloClaro},
  en_camino: {txt:"En camino", col:C.azul,    bg:C.azulClaro},
  recibido:  {txt:"Recibido",  col:C.verde,   bg:C.verdeClaro},
  cancelado: {txt:"Cancelado", col:C.rojo,    bg:C.rojoClaro},
};

function Pedidos({peds,setPeds}){
  const [dlg,setDlg]=useState(false);
  const [fm,setFm]=useState({prov:"",pieza:"",ref:"",precio:"",para:"",mat:"",entrega:""});
  const crear=()=>{if(!fm.prov||!fm.pieza)return;setPeds([{id:`PED-${String(peds.length+4).padStart(3,"0")}`,prov:fm.prov,pieza:fm.pieza,ref:fm.ref,precio:parseFloat(fm.precio)||0,para:fm.para,mat:fm.mat,entrega:fm.entrega,estado:"solicitado",fecha:"ahora"},...peds]);setFm({prov:"",pieza:"",ref:"",precio:"",para:"",mat:"",entrega:""});setDlg(false);};
  return(
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
        <div style={{fontSize:17,fontWeight:700,color:C.texto}}>Pedidos a proveedores</div>
        <Btn onClick={()=>setDlg(true)}>+ Nuevo pedido</Btn>
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {peds.map(p=>{const e=EP[p.estado]||EP.solicitado;return(
          <div key={p.id} style={{background:C.carbono,border:`1px solid ${p.estado==="en_camino"?C.azul+"55":C.borde}`,borderRadius:10,padding:"13px 17px",display:"flex",alignItems:"center",gap:13,flexWrap:"wrap"}}>
            <div style={{fontFamily:"monospace",fontSize:11,color:C.textoSuave,flexShrink:0,width:70}}>{p.id}</div>
            <div style={{flex:1,minWidth:170}}>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontWeight:700,color:C.texto,fontSize:13}}>{p.pieza}</span>
                {p.ref&&<span style={{background:C.plomo,color:C.textoSuave,borderRadius:4,padding:"1px 6px",fontSize:11,fontFamily:"monospace"}}>{p.ref}</span>}
              </div>
              <div style={{color:C.textoSuave,fontSize:12,marginTop:2}}>{p.prov}{p.para&&<span> - Para: <span style={{color:C.texto}}>{p.para}</span></span>}{p.mat&&p.mat!=="-"&&<span> - {p.mat}</span>}</div>
              {p.entrega&&p.entrega!=="-"&&<div style={{fontSize:11,color:C.azul,marginTop:2}}>Entrega: {p.entrega}</div>}
            </div>
            <div style={{fontFamily:"monospace",fontWeight:700,color:C.texto,flexShrink:0}}>{fmtEur(p.precio)}</div>
            <Bdg color={e.col} bg={e.bg} txt={e.txt}/>
            <select value={p.estado} onChange={ev=>setPeds(peds.map(x=>x.id===p.id?{...x,estado:ev.target.value}:x))} style={{background:C.plomo,color:C.textoSuave,border:`1px solid ${C.borde}`,borderRadius:6,padding:"4px 7px",fontSize:11,cursor:"pointer"}}>
              <option value="solicitado">Solicitado</option><option value="en_camino">En camino</option><option value="recibido">Recibido</option><option value="cancelado">Cancelado</option>
            </select>
          </div>
        );})}
      </div>
      {dlg&&<Dlg title="Nuevo pedido" onClose={()=>setDlg(false)} w={490}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
          <Inp label="Proveedor" val={fm.prov} set={v=>setFm({...fm,prov:v})} ph="Nombre del proveedor"/>
          <Inp label="Referencia" val={fm.ref} set={v=>setFm({...fm,ref:v})} ph="Codigo pieza"/>
        </div>
        <Inp label="Pieza / descripcion" val={fm.pieza} set={v=>setFm({...fm,pieza:v})} ph="Ej: Kit embrague Seat Ibiza 2019"/>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0 12px"}}>
          <Inp label="Precio" type="number" val={fm.precio} set={v=>setFm({...fm,precio:v})} ph="0.00"/>
          <Inp label="Entrega estimada" val={fm.entrega} set={v=>setFm({...fm,entrega:v})} ph="manyana, en 2 dias..."/>
          <Inp label="Para cliente" val={fm.para} set={v=>setFm({...fm,para:v})} ph="Nombre del cliente"/>
          <Inp label="Matricula" val={fm.mat} set={v=>setFm({...fm,mat:v})} ph="0000 XXX"/>
        </div>
        <div style={{display:"flex",gap:8,marginTop:6}}><Btn v="gh" onClick={()=>setDlg(false)}>Cancelar</Btn><Btn onClick={crear}>Registrar pedido</Btn></div>
      </Dlg>}
    </div>
  );
}


const RENT_FACTS = {
  "Cambio de aceite":  [{cli:"Maria Garcia",fac:"F-089",imp:128},{cli:"Laura Torres",fac:"F-081",imp:95},{cli:"Ana Martin",fac:"F-077",imp:89},{cli:"Pedro Sanchez",fac:"F-071",imp:95},{cli:"Carlos Ruiz",fac:"F-068",imp:102}],
  "Frenos / pastillas":[{cli:"Juan Lopez",fac:"F-088",imp:240},{cli:"Roberto Vega",fac:"F-083",imp:198},{cli:"Elena Castro",fac:"F-079",imp:275},{cli:"Maria Garcia",fac:"F-072",imp:250}],
  "Neumaticos":        [{cli:"Ana Martin",fac:"F-086",imp:320},{cli:"Carlos Ruiz",fac:"F-080",imp:380},{cli:"Laura Torres",fac:"F-076",imp:295},{cli:"Pedro Sanchez",fac:"F-070",imp:310},{cli:"Juan Lopez",fac:"F-065",imp:340}],
  "Embrague":          [{cli:"Carlos Ruiz",fac:"F-087",imp:720},{cli:"Roberto Vega",fac:"F-074",imp:680},{cli:"Elena Castro",fac:"F-062",imp:690}],
  "Diagnosis / averia":[{cli:"Pedro Sanchez",fac:"F-085",imp:80},{cli:"Desconocido",fac:"F-082",imp:75},{cli:"Ana Martin",fac:"F-078",imp:90}],
  "Revision completa": [{cli:"Carlos Ruiz",fac:"F-086",imp:240},{cli:"Maria Garcia",fac:"F-073",imp:198},{cli:"Juan Lopez",fac:"F-067",imp:210}],
  "ITV preparacion":   [{cli:"Carlos Ruiz",fac:"F-084",imp:60},{cli:"Laura Torres",fac:"F-075",imp:55},{cli:"Ana Martin",fac:"F-066",imp:50}],
};

// ── RENTABILIDAD ──────────────────────────────────────────────────────────────
function Rentabilidad(){
  const [open,setOpen]=useState(null); // tipo seleccionado para desglose
  const max=Math.max(...RENT.map(r=>r.total));
  const tot=RENT.reduce((s,r)=>s+r.total,0);
  const mc=m=>m>=60?C.verde:m>=45?C.amarillo:C.rojo;
  const top=k=>[...RENT].sort((a,b)=>b[k]-a[k])[0];
  const det=open?RENT.find(r=>r.tipo===open):null;
  const detFacts=open?(RENT_FACTS[open]||[]):[];
  return(
    <div>
      <div style={{fontSize:17,fontWeight:700,color:C.texto,marginBottom:3}}>Rentabilidad por servicio</div>
      <div style={{fontSize:12,color:C.textoSuave,marginBottom:18}}>Ultimo mes · Total: <span style={{color:C.verde,fontWeight:700,fontFamily:"monospace"}}>{fmtEur(tot)}</span> · Pulsa una categoria para ver el desglose</div>
      <div style={{display:"flex",gap:8,marginBottom:20,flexWrap:"wrap"}}>
        {[{l:"Mas rentable",v:top("margen").tipo,c:C.verde},{l:"Mayor volumen",v:top("total").tipo,c:C.azul},{l:"Mas trabajos",v:top("n").tipo,c:C.acento}].map((k,i)=>(
          <div key={i} style={{background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:11,padding:"14px 18px",flex:1,minWidth:150}}>
            <div style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:5}}>{k.l}</div>
            <div style={{color:k.c,fontWeight:700,fontSize:13}}>{k.v}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:7}}>
        {[...RENT].sort((a,b)=>b.total-a.total).map(r=>{
          const isOpen=open===r.tipo;
          const facts=RENT_FACTS[r.tipo]||[];
          return(
            <div key={r.tipo}>
              <div onClick={()=>setOpen(isOpen?null:r.tipo)}
                style={{background:C.carbono,border:`1px solid ${isOpen?C.acento+"80":C.borde}`,borderRadius:isOpen?"10px 10px 0 0":10,padding:"13px 17px",cursor:"pointer",transition:"border-color 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:13,marginBottom:7,flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:150}}>
                    <div style={{fontWeight:700,color:C.texto,fontSize:13,display:"flex",alignItems:"center",gap:8}}>
                      {r.tipo}
                      <span style={{color:C.textoSuave,fontSize:11,fontWeight:400}}>{isOpen?"▲":"▼"}</span>
                    </div>
                    <div style={{color:C.textoSuave,fontSize:12}}>{r.n} trabajos · {fmtEur(r.media)} de media</div>
                  </div>
                  <div style={{display:"flex",gap:18,flexShrink:0}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontFamily:"monospace",fontWeight:800,fontSize:15,color:C.texto}}>{fmtEur(r.total)}</div>
                      <div style={{color:C.textoSuave,fontSize:11}}>ingresado</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontFamily:"monospace",fontWeight:800,fontSize:15,color:mc(r.margen)}}>{r.margen}%</div>
                      <div style={{color:C.textoSuave,fontSize:11}}>margen</div>
                    </div>
                  </div>
                </div>
                <div style={{height:5,background:C.plomo,borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(r.total/max)*100}%`,background:`linear-gradient(90deg,${C.acento},${C.amarillo})`,borderRadius:3}}/>
                </div>
              </div>

              {/* DESGLOSE DE FACTURAS */}
              {isOpen&&(
                <div style={{background:C.plomo,border:`1px solid ${C.acento}80`,borderTop:"none",borderRadius:"0 0 10px 10px",padding:"4px 12px 12px"}}>
                  <div style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em",padding:"10px 4px 6px"}}>
                    Facturas de este mes · {r.tipo}
                  </div>
                  {facts.map((f,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"8px 4px",borderTop:i>0?`1px solid ${C.borde}`:"none"}}>
                      <div style={{flex:1}}>
                        <div style={{color:C.texto,fontSize:13,fontWeight:600}}>{f.cli}</div>
                        <div style={{color:C.textoSuave,fontSize:11,fontFamily:"monospace"}}>{f.fac}</div>
                      </div>
                      <div style={{fontFamily:"monospace",fontWeight:700,color:C.verde,fontSize:13}}>{fmtEur(f.imp)}</div>
                      <div style={{width:80,height:4,background:C.carbono,borderRadius:2,overflow:"hidden"}}>
                        <div style={{height:"100%",width:`${(f.imp/Math.max(...facts.map(x=>x.imp)))*100}%`,background:C.acento,borderRadius:2}}/>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:10,paddingTop:8,borderTop:`1px solid ${C.borde}`}}>
                    <span style={{color:C.textoSuave,fontSize:12}}>{facts.length} facturas</span>
                    <span style={{color:C.verde,fontFamily:"monospace",fontWeight:700,fontSize:13}}>{fmtEur(facts.reduce((s,f)=>s+f.imp,0))}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{marginTop:18,background:C.carbono,border:`1px solid ${C.borde}`,borderRadius:10,padding:"13px 17px"}}>
        <div style={{color:C.textoSuave,fontSize:11,fontWeight:600,textTransform:"uppercase",marginBottom:8}}>Recomendacion</div>
        <div style={{color:C.texto,fontSize:13,lineHeight:1.7}}>Los <span style={{color:C.verde,fontWeight:700}}>diagnosticos</span> y <span style={{color:C.verde,fontWeight:700}}>cambios de aceite</span> tienen el margen mas alto. Los <span style={{color:C.amarillo,fontWeight:700}}>neumaticos</span> generan volumen pero margen bajo.</div>
      </div>
    </div>
  );
}

// ── APP ───────────────────────────────────────────────────────────────────────
export default function App(){
  const [tab,setTab]=useState("portal");
  const [citas,setCitas]    =useState(CITAS0);
  const [facts,setFacts]    =useState(FACTURAS0);
  const [albs,setAlbs]      =useState(ALBARANES0);
  const [peds,setPeds]      =useState(PEDIDOS0);
  const [comms,setComms]    =useState(COMMS0);
  const [clts,setClts]      =useState(CLIENTES0);
  const [fbReady,setFbReady]=useState(false);

  // ── Carga inicial desde Firestore (una sola vez) ──────────────────────────
  useEffect(()=>{
    const cargar = async () => {
      try {
        const snap = await getDocs(collection(db,"taller"));
        if(snap.empty){
          // Primera vez: sube los datos iniciales
          await Promise.all([
            ...CITAS0.map(   d=>setDoc(doc(db,"taller",`cita_${d.id}`),   {tipo:"cita",   ...d})),
            ...FACTURAS0.map(d=>setDoc(doc(db,"taller",`factura_${d.id}`),{tipo:"factura",...d})),
            ...ALBARANES0.map(d=>setDoc(doc(db,"taller",`albaran_${d.id}`),{tipo:"albaran",...d})),
            ...PEDIDOS0.map( d=>setDoc(doc(db,"taller",`pedido_${d.id}`), {tipo:"pedido", ...d})),
            ...CLIENTES0.map(d=>setDoc(doc(db,"taller",`cliente_${d.id}`),{tipo:"cliente",...d})),
            ...COMMS0.map(   d=>setDoc(doc(db,"taller",`comm_${d.id}`),   {tipo:"comm",   ...d})),
          ]);
        } else {
          const docs = snap.docs.map(d=>d.data());
          setCitas(   docs.filter(d=>d.tipo==="cita").map(   ({tipo,...r})=>r));
          setFacts(   docs.filter(d=>d.tipo==="factura").map(({tipo,...r})=>r));
          setAlbs(    docs.filter(d=>d.tipo==="albaran").map(({tipo,...r})=>r));
          setPeds(    docs.filter(d=>d.tipo==="pedido").map( ({tipo,...r})=>r));
          setClts(    docs.filter(d=>d.tipo==="cliente").map(({tipo,...r})=>r));
          setComms(   docs.filter(d=>d.tipo==="comm").map(   ({tipo,...r})=>r));
        }
      } catch(e){ console.error("Firebase error:",e); }
      setFbReady(true);
    };
    cargar();
  },[]);

  // ── Helpers para guardar en Firestore ─────────────────────────────────────
  const saveCita    = async d => { await setDoc(doc(db,"taller",`cita_${d.id}`),   {tipo:"cita",   ...d}); };
  const saveFactura = async d => { await setDoc(doc(db,"taller",`factura_${d.id}`),{tipo:"factura",...d}); };
  const saveAlbaran = async d => { await setDoc(doc(db,"taller",`albaran_${d.id}`),{tipo:"albaran",...d}); };
  const savePedido  = async d => { await setDoc(doc(db,"taller",`pedido_${d.id}`), {tipo:"pedido", ...d}); };
  const saveCliente = async d => { await setDoc(doc(db,"taller",`cliente_${d.id}`),{tipo:"cliente",...d}); };
  const saveComm    = async d => { await setDoc(doc(db,"taller",`comm_${d.id}`),   {tipo:"comm",   ...d}); };

  // Wrappers que actualizan estado local Y Firestore
  const setCitasFb = async nuevas => { setCitas(nuevas); for(const d of nuevas) await saveCita(d); };
  const setFactsFb = async nuevas => { setFacts(nuevas); for(const d of nuevas) await saveFactura(d); };
  const setAlbsFb  = async nuevas => { setAlbs(nuevas);  for(const d of nuevas) await saveAlbaran(d); };
  const setPedsFb  = async nuevas => { setPeds(nuevas);  for(const d of nuevas) await savePedido(d); };
  const setCltsFb   = async nuevas => { setClts(nuevas);  for(const d of nuevas) await saveCliente(d); };
  const setCommsFb  = async nuevas => { setComms(nuevas); for(const d of nuevas) await saveComm(d); };


  const enT =citas.filter(c=>c.estado==="en_taller").length;
  const espP=citas.filter(c=>c.estado==="esperando_pieza").length;
  const albP=albs.filter(a=>a.estado==="pendiente").length;
  const facP=facts.filter(f=>f.estado==="pendiente").length;
  const pedC=peds.filter(p=>p.estado==="en_camino").length;
  const comP=comms.filter(c=>!c.ok).length;
  const totM=facts.reduce((s,f)=>s+f.servicios.reduce((a,l)=>a+l.precio,0),0);

  const TABS=[
    {id:"portal",        lbl:"Consulta estado",  publico:true},
    {id:"agenda",        lbl:"Agenda"},
    {id:"comunicaciones",lbl:"Comunicaciones",   dot:comP},
    {id:"albaranes",     lbl:"Albaranes",         dot:albP},
    {id:"facturas",      lbl:"Facturas",          dot:facP},
    {id:"pedidos",       lbl:"Pedidos",           dot:pedC},
    {id:"clientes",      lbl:"Clientes"},
    {id:"rentabilidad",  lbl:"Rentabilidad"},
  ];

  const esPortal=tab==="portal";

  return(
    <div style={{minHeight:"100vh",background:C.negro,fontFamily:"'Inter',system-ui,sans-serif",color:C.texto}}>
      <div style={{borderBottom:`1px solid ${C.borde}`,padding:"0 20px"}}>
        <div style={{maxWidth:1060,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between",height:50}}>
          <div style={{display:"flex",alignItems:"center",gap:9}}>
            <div style={{width:28,height:28,background:C.acento,borderRadius:7,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>W</div>
            <span style={{fontWeight:800,fontSize:15,letterSpacing:"-0.5px"}}>TallerOS</span>
            <span style={{color:C.textoSuave,fontSize:12}}>- Taller Perez</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:13}}>
            {!esPortal&&espP>0&&<span style={{color:C.morado,fontSize:12,fontWeight:600}}>{espP} esperando pieza</span>}
            {!esPortal&&comP>0&&<span style={{color:C.rojo,fontSize:12,fontWeight:600}}>{comP} mensajes</span>}
            {!esPortal&&<div style={{display:"flex",alignItems:"center",gap:5}}><div style={{width:7,height:7,borderRadius:"50%",background:C.verde,boxShadow:`0 0 6px ${C.verde}`}}/><span style={{color:C.textoSuave,fontSize:12}}>{enT} en taller</span></div>}
          </div>
        </div>
      </div>

      <div style={{maxWidth:1060,margin:"0 auto",padding:"16px 20px"}}>
        {!esPortal&&<div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <KPI val={citas.length} label="Citas hoy"   sub={`${espP} esp. pieza`}/>
          <KPI val={enT}          label="En taller"   color={C.acento}/>
          <KPI val={comP}         label="Mensajes"    color={comP>0?C.rojo:C.textoSuave} sub="sin gestionar" dot={comP}/>
          <KPI val={albP}         label="Por aprobar" color={albP>0?C.amarillo:C.textoSuave} sub="albaranes" dot={albP}/>
          <KPI val={facP}         label="Por cobrar"  color={facP>0?C.amarillo:C.verde} sub="facturas" dot={facP}/>
          <KPI val={pedC}         label="En camino"   color={pedC>0?C.azul:C.textoSuave} sub="pedidos"/>
          <KPI val={fmtEur(totM)} label="Facturado"   color={C.verde} sub="este mes"/>
        </div>}

        <div style={{display:"flex",borderBottom:`1px solid ${C.borde}`,marginBottom:20,overflowX:"auto"}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)}
              style={{background:"none",border:"none",borderBottom:tab===t.id?`2px solid ${t.publico?C.azul:C.acento}`:"2px solid transparent",color:tab===t.id?C.texto:C.textoSuave,padding:"9px 12px",fontWeight:tab===t.id?700:500,fontSize:12,cursor:"pointer",marginBottom:-1,position:"relative",whiteSpace:"nowrap"}}>
              {t.publico&&<span style={{fontSize:9,background:C.azulClaro,color:C.azul,borderRadius:3,padding:"1px 4px",marginRight:5,fontWeight:700,verticalAlign:"middle"}}>CLIENTE</span>}
              {t.lbl}
              {t.dot>0&&<span style={{position:"absolute",top:4,right:0,background:C.rojo,color:"#fff",borderRadius:"50%",width:14,height:14,fontSize:9,fontWeight:800,display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{t.dot}</span>}
            </button>
          ))}
        </div>

        {!fbReady&&(
          <div style={{textAlign:"center",padding:"60px 0",color:C.textoSuave}}>
            <div style={{fontSize:28,marginBottom:12}}>🔧</div>
            <div style={{fontSize:14,fontWeight:600}}>Cargando datos...</div>
          </div>
        )}
        {fbReady&&tab==="portal"         &&<PortalCliente    citas={citas} clientes={clts}/>}
        {fbReady&&tab==="agenda"         &&<Agenda           citas={citas} set={setCitasFb} clientes={clts}/>}
        {fbReady&&tab==="comunicaciones" &&<Comms            comms={comms} setComms={setCommsFb}/>}
        {fbReady&&tab==="albaranes"      &&<Albaranes        albs={albs}   setAlbs={setAlbsFb}  setFacts={setFactsFb} setTab={setTab}/>}
        {fbReady&&tab==="facturas"       &&<Facturas         facts={facts} setFacts={setFactsFb}/>}
        {fbReady&&tab==="pedidos"        &&<Pedidos          peds={peds}   setPeds={setPedsFb}/>}
        {fbReady&&tab==="clientes"       &&<Clientes         clientes={clts} setClientes={setCltsFb}/>}
        {fbReady&&tab==="rentabilidad"   &&<Rentabilidad/>}
      </div>
    </div>
  );
}
