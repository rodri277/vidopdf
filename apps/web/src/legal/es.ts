import { CONTACT_EMAIL } from './types';
import type { LegalTexts } from './types';

const UPDATED = '9 de octubre de 2026';

export const legalEs: LegalTexts = {
  privacy: {
    title: 'Política de privacidad',
    updated: UPDATED,
    sections: [
      {
        heading: 'En pocas palabras',
        paragraphs: [
          'Tus documentos no salen de tu dispositivo. Vidopdf procesa los PDF y las imágenes dentro de tu navegador: no hay servidor que los reciba, ni cuentas, ni analítica, ni cookies de seguimiento, ni peticiones a terceros.',
        ],
      },
      {
        heading: 'Quién es el responsable',
        paragraphs: [
          `vidotho, alias con el que la persona desarrolladora firma este proyecto (consulta el Aviso legal). Contacto para cualquier asunto de privacidad: ${CONTACT_EMAIL}.`,
        ],
      },
      {
        heading: 'Qué pasa con tus archivos',
        paragraphs: [
          'Los archivos que eliges se leen con las funciones normales del navegador y se procesan en la memoria de tu equipo, en trabajadores web (Web Workers). El resultado se guarda donde tú decidas al pulsar «Guardar».',
          'Ningún archivo se sube a un servidor ni se guarda en el navegador entre una visita y otra: al cerrar o recargar la pestaña, el espacio de trabajo desaparece. Como nunca recibimos el contenido de tus documentos, no lo tratamos como datos personales.',
        ],
      },
      {
        heading: 'Lo que guarda tu navegador',
        paragraphs: [
          'Vidopdf no usa cookies. Solo guarda en el almacenamiento local de tu navegador (localStorage) dos preferencias que tú eliges: el idioma y el tamaño de las miniaturas. Se quedan en tu dispositivo, son necesarias para recordar esa elección y puedes borrarlas desde los ajustes del navegador cuando quieras.',
        ],
      },
      {
        heading: 'Datos técnicos que registra el alojamiento',
        paragraphs: [
          'El sitio se sirve desde Vercel Inc., un proveedor de alojamiento. Como en cualquier página web, al cargarla el proveedor recibe y puede registrar datos técnicos de la conexión: dirección IP, ubicación aproximada deducida de la IP (país y ciudad), tipo de navegador y de dispositivo, página pedida y fecha y hora.',
          'Se tratan para entregar el sitio, mantenerlo seguro y evitar abusos (interés legítimo, art. 6.1.f del RGPD). Vercel actúa como encargado del tratamiento. El plazo de conservación lo fija el proveedor, que indica que guarda los datos el tiempo mínimo necesario y no da un plazo concreto. La persona titular no activa la analítica de visitas del proveedor ni usa esos datos para elaborar perfiles.',
          'Si algún día se añadiera analítica de cualquier tipo, se pediría antes tu consentimiento y esta política cambiaría.',
        ],
      },
      {
        heading: 'Transferencias fuera de la Unión Europea',
        paragraphs: [
          'Vercel Inc. está en Estados Unidos. Según su propia documentación, está certificada en el Marco de Privacidad de Datos UE-EE. UU. (y en sus extensiones para el Reino Unido y Suiza), que es la base de esas transferencias; para otros casos indica que usa cláusulas contractuales tipo. Se comprobó el 9 de octubre de 2026 y puedes verificarlo tú mismo en dataprivacyframework.gov/list.',
        ],
      },
      {
        heading: 'Si me escribes',
        paragraphs: [
          `Si envías un correo a ${CONTACT_EMAIL}, uso tu dirección y tu mensaje solo para responderte, y los borro cuando dejan de hacer falta. El correo lo gestiona Google (Gmail).`,
        ],
      },
      {
        heading: 'Tus derechos',
        paragraphs: [
          `Puedes pedir acceso, rectificación, supresión, oposición, limitación y portabilidad de tus datos escribiendo a ${CONTACT_EMAIL}. Como Vidopdf no guarda datos tuyos más allá de lo descrito, normalmente no habrá nada que entregar o borrar, y te lo diré. Si crees que tus datos no se tratan bien, puedes reclamar ante la Agencia Española de Protección de Datos (aepd.es) o ante la autoridad de control de tu país.`,
        ],
      },
      {
        heading: 'Cómo comprobarlo',
        paragraphs: [
          'La política de seguridad del sitio (CSP) impide cargar nada de otros orígenes. Abre las herramientas del navegador, pestaña Red, y comprueba que, mientras trabajas con tus archivos, no sale ninguna petición. El código es abierto y las pruebas automáticas fallan si el sitio contacta con otro origen.',
        ],
      },
      {
        heading: 'Menores y cambios',
        paragraphs: [
          'Vidopdf no recoge datos de nadie, tampoco de menores. Si esta política cambia, se actualiza la fecha de arriba; el historial completo está en el repositorio.',
        ],
      },
    ],
  },

  legal: {
    title: 'Aviso legal',
    updated: UPDATED,
    sections: [
      {
        heading: 'Titular',
        paragraphs: [
          `vidotho, alias con el que la persona desarrolladora firma este proyecto. Correo de contacto: ${CONTACT_EMAIL}.`,
          'Vidopdf es un proyecto personal de portafolio: gratuito, sin anuncios, sin ingresos y sin actividad económica. Por eso se identifica con su alias de desarrollador. Si algún día generara ingresos o se prestara con carácter económico, se identificaría a la persona prestadora con todos los datos que exige la Ley 34/2002 (LSSI-CE). Si una autoridad competente o una persona con interés legítimo necesita saber quién es, puede pedirlo por correo.',
        ],
      },
      {
        heading: 'Objeto',
        paragraphs: [
          'Vidopdf es un espacio de trabajo para PDF que funciona en tu navegador: permite unir, dividir, reordenar, rotar y comprimir PDF y convertir imágenes a PDF y PDF a imágenes, sin enviar los archivos a ningún servidor.',
        ],
      },
      {
        heading: 'Propiedad intelectual y marcas',
        paragraphs: [
          'El código de Vidopdf es software libre bajo licencia MIT (© 2026 vidotho). Usa componentes de terceros con sus propias licencias; están en la página Licencias.',
          '«PDF» es un estándar abierto (ISO 32000) y se usa aquí de forma descriptiva. Vidopdf no está afiliado a Adobe ni a ninguna otra empresa; los nombres y marcas que se mencionen pertenecen a sus dueños.',
        ],
      },
      {
        heading: 'Documentos protegidos',
        paragraphs: [
          'Vidopdf no admite PDF con contraseña ni con restricciones de propietario: los rechaza con un aviso y no los procesa.',
        ],
      },
      {
        heading: 'Ley aplicable',
        paragraphs: [
          'Este sitio se rige por la legislación española, sin perjuicio de los derechos que la ley reconozca a las personas consumidoras en su país de residencia.',
        ],
      },
    ],
  },

  terms: {
    title: 'Términos de uso',
    updated: UPDATED,
    sections: [
      {
        heading: 'Uso del servicio',
        paragraphs: [
          'Al usar Vidopdf aceptas estos términos. El servicio es gratuito y se ofrece «tal cual» y según disponibilidad: puede cambiar, tener errores o dejar de estar disponible sin aviso.',
        ],
      },
      {
        heading: 'Tus documentos',
        items: [
          'Debes tener derecho a usar y modificar los documentos que procesas, y eres responsable de lo que hagas con ellos.',
          'Vidopdf nunca modifica tus originales: crea archivos nuevos. Aun así, conserva siempre una copia de los originales.',
          'Revisa el resultado antes de usarlo. Comprimir reduce la calidad de las imágenes de forma irreversible en el archivo nuevo, y unir PDF puede perder marcadores, etiquetas de accesibilidad o enlaces de formularios. El README del proyecto lista estas limitaciones.',
        ],
      },
      {
        heading: 'Usos no permitidos',
        paragraphs: [
          'No uses Vidopdf para vulnerar derechos de terceros o la ley, incluidas las medidas tecnológicas de protección de obras protegidas.',
        ],
      },
      {
        heading: 'Limitación de responsabilidad',
        paragraphs: [
          'En la medida en que la ley lo permita, la persona titular no responde de daños indirectos ni de la pérdida de datos, de archivos o de beneficios derivada del uso del servicio. Nada de lo anterior excluye la responsabilidad por dolo o negligencia grave, ni los derechos que la ley reconoce a las personas consumidoras y que no pueden renunciarse.',
        ],
      },
      {
        heading: 'Código abierto',
        paragraphs: [
          'El código se publica con licencia MIT, que incluye su propia exención de garantías. Los términos de uso del sitio web se suman a esa licencia y no la restringen.',
        ],
      },
      {
        heading: 'Cambios y contacto',
        paragraphs: [
          `Estos términos pueden cambiar; la fecha de arriba indica la última revisión. Dudas o avisos: ${CONTACT_EMAIL}. Se aplica la legislación española, sin perjuicio de los derechos imperativos de las personas consumidoras.`,
        ],
      },
    ],
  },
};
