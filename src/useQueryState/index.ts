import { useEffect, useState } from 'react';
import { EMPTY, INFO_CODE_STATUS } from '../contants';
import { useAdapter, useNotify, useQuery } from '../hooks';
import { DTOsysGetData, ExtraOptions } from '../interfaces';
import { useQueriesSysgetdata } from '../useQueriesSysgetdata';
import { isNotEmpty, sleep } from './utils';

/** **useQueryState**
 * ---------------------------------------------------------------------------
 * Interfaces Genéricas
 *   * La primera interface _requerida_ __T__ define el tipo de genérico __data__ de respuesta
 *   * La segunda interface _opcional_  __G__ define el tipo de genérico __params__
 *   * La tercera interface _opcional_  __A__ define el tipo de genérico __adaptedResults__
 *
 * Recibe dos argumentos:
 *  * fn: string -> nombre de la función de la BD
 *  * init: obj de args opcionales
 *
 * --------------------------------------------------------------------------
 *
 * init:
 *   * name:         idetifica por consola el servicio con el nombre asignado
 *   * auto:         la petición se hará de manera automatica al montar el componente (default false )
 *   * singleObject: determina si el __data__ contendra un obj o un array (default false)
 *   * dependsOn:    dependencia de fetching automático
 *   * searchParams: seteo opcional de parametros de busqueda. - Se activa mediante: auto - send
 *      - _Para obtener inferencia de tipos se debe definir la interfaz "G"_
 *   * useAdapter:   determina si se debe emplear una fn adaptadora al **data** resultante
 *      - _Para obtener inderencia sobre el result adaptado se debe definir la interfaz "A"_
 *   * adapter:      función adaptadora - en caso de no resultados dará aviso mediante **notify**
 *   * runAfter:
 *       * debug:   si se setea a true mostrará un mensaje por consola (default false )
 *       * execute: fn a ejecutar luego de completar el proceso final
 *
 *   * fetchDelay:         delay en el fetching de datos
 *   * showResponse:       muestra por consola el result de datos
 *   * adapterDelay:       delay en la adaptación de los datos resultantes del fetch
 *   * showAdaptedResults: muestra por consola el los datos devueltos por el adapter
 *   * mode:
 *       * develop:  modo desarrollo muestra por consola el request
 *       * stage:    sin efectos secundarios definidos
 *       * prod:     sin efectos secundarios definidos
 *
 * --------------------------------------------------------------------------
 *
 * isloading
 *   * Informa el estado de carga, es relevante cuando el adapter sea utilizado
 *
 * --------------------------------------------------------------------------
 * params:
 *   * Estos son los parametros de busqueda
 *   * _Para obtener inferencia de tipos se debe definir la interfaz "G"_
 * --------------------------------------------------------------------------
 *
 * requests:
 *   * send:   genera una petición con parametros _opcionales_ de busqueda
 *   * search: genera una petición con parametros _requeridos_ de busqueda
 *
 * --------------------------------------------------------------------------
 *
 * notify:
 *   * exists:   si existe alguna notificación
 *   * info:     si es un notificación _info_
 *   * error:    si hubo un _error_
 *   * message:  mensaje de la notificación
 *
 * --------------------------------------------------------------------------
 *
 * State query:
 *   * isFetching:   si la petición esta en progreso
 *   * isReady:      si la petición se ha completado
 *   * containsData: si la petición obtubo datos
 *   * data:         datos de la petición
 *
 * --------------------------------------------------------------------------
 *
 * State adapter:
 *   * isAdapting:           si el adapter está procesando los datos
 *   * adapterCompleted:     si el adapter ha finalizado el proceso
 *   * adaptedResultsExists: si el adapter obtubo datos
 *   * adaptedResults:       datos adaptados
 *
 * --------------------------------------------------------------------------
 *
 * ! Se exporta la interface de NotifyState para poder utilizarla fuera del ccustomHook
 */
export const useQueryState = <T, G = any, A = any>(
  fn: string,
  init?: ExtraOptions<G, A, T>
) => {
  const [params, setParams] = useState<G>({} as G);
  const [isLoading, setIsLoading] = useState(false);
  const querySysgetdata = useQueriesSysgetdata<T, G>({
    fn,
    parametros: params,
    mode: init?.mode,
  });
  const notify = useNotify();
  const adapter = useAdapter<A>();
  const query = useQuery<T>();

  // ** ---- Handler de estado de la petición asincrona ---- ** //
  const request = async () => {
    try {
      setIsLoading(true);
      !!init?.name && console.log(`Se llamo desde el servicio: ${init?.name}`);
      clearData();
      query.request();

      let response: DTOsysGetData<T>;

      if (!!init?.mode && init.mode == 'mock') {
        if (init.mockResponse == undefined)
          throw new Error('Falta asignar la propiedad "mockData"');

        response = init.mockResponse;
      } else {
        response = await querySysgetdata.post();
      }

      await sleep(init?.fetchDelay);

      !!init?.showResponse && console.log('Repomse_DTO: ', response);

      response.estado === INFO_CODE_STATUS && notify.info(response.mensaje!);

      if (response.rowcount > EMPTY) {
        const { datos } = response;
        if (!!init?.singleObject) {
          query.response((datos as any)[0]);
        } else {
          query.response(datos);
        }

        if (!!init?.useAdapter) {
          await handlerAdapter(datos as any);
          setIsLoading(false);
        }
      } else {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Detalle del error del request: ', error);
      notify.info();
    } finally {
      query.completed();
      !!init?.name && console.info(`Servicio: ${init?.name} finalizado!`);
      !init?.useAdapter && setIsLoading(false);
    }
  };

  //?? limpia el store
  const clearData = () => {
    query.reset();
    notify.reset();
    adapter.reset();
  };

  //?? Dispacher del request
  const hanlderRequest = () => {
    !!init?.searchParams ? setParams(init?.searchParams!) : request();
  };

  //?? Manejador del adapter
  const handlerAdapter = async (response: T) => {
    return new Promise(async (resolve, __) => {
      adapter.initialize();
      const result = (await init?.adapter!(response)) as A;

      !!init?.showAdaptedResults &&
        console.log('Resultado del adapter: ', result);
      await sleep(init?.adapterDelay);

      resolve(result);
    })
      .then(resultAdapted => {
        isNotEmpty(resultAdapted)
          ? adapter.load(resultAdapted as A)
          : notify.info();
      })
      .finally(() => {
        adapter.completed();
      });
  };

  // ! Fetching reactivo en el montaje del componente
  useEffect(() => {
    !!init?.auto && hanlderRequest();
  }, []);

  // ! Request reactivo mediante el seteo de params
  useEffect(() => {
    isNotEmpty(params) && request();
  }, [params]);

  // ! Refetching reactivo mediante dependencia
  useEffect(() => {
    !!init?.dependsOn && setParams(init?.searchParams!);
  }, [init?.dependsOn]);

  // ! Despacha la comprobación de response disponible
  useEffect(() => {
    query.isReady();
  }, [query.state.isFetching]);

  /** Ejecutará la acción cuando cumpla las siguientes condiciones:
   *    1. El servicio haya sido iniciado
   *    2. El procesamiento de data haya finalizado
   *    3. Se haya definido la propiedad afterRun
   */
  useEffect(() => {
    if (query.state.isStarted && !isLoading && !!init?.runAfter) {
      !!init.runAfter.debug &&
        console.log('---- Ejecución de la acción final ----');
      init.runAfter.execute();
    }
  }, [isLoading]);

  return {
    // ?? search params and notify
    isLoading,
    params,
    notify: notify.state,

    //** properties state query
    isFetching: query.state.isFetching,
    isReady: query.state.isReady,
    containsData: query.state.containData,
    data: query.state.data,

    //** properties state adpter
    isAdapting: adapter.isAdapting,
    adapterCompleted: adapter.completed,
    adaptedResultsExists: adapter.resultExists,
    adaptedResults: adapter.results,

    //?? Methods
    send: hanlderRequest,
    search: (args: G) => setParams(args),
  };
};