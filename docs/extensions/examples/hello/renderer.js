// UI half. A plain script in AMD shape: it names the libraries it wants
// from Studio and gets Studio's own copies. Written without a build step so
// the example can be installed as it is; a real extension would be bundled
// from JSX/TypeScript with these names marked as externals.

window.rosettaStudio.define(
  'studio-examples.hello',
  ['react', '@mui/material', '@rosetta/studio-api'],
  (React, Mui, studio) => {
    const h = React.createElement;
    let api;

    const HelloIcon = () =>
      h(
        Mui.SvgIcon,
        { fontSize: 'small' },
        h('path', {
          d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-3.5 7a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 18c-2.3 0-4.3-1.4-5.1-3.5h10.2C16.3 16.6 14.3 18 12 18z',
        }),
      );

    const HelloScreen = () => {
      const [greeting, setGreeting] = React.useState('');

      React.useEffect(() => {
        api.ipc.invoke('hello:greet', 'Studio').then(setGreeting);
      }, []);

      // AppLayout is the frame of every screen: it sets the side panel
      // and the top bar for this screen.
      return h(
        studio.AppLayout,
        {
          panelTitle: 'Hello',
          sidebarContent: h(
            Mui.Box,
            { sx: { p: 2 } },
            h(
              Mui.Typography,
              { variant: 'body2', color: 'text.secondary' },
              'This side panel belongs to the Hello extension.',
            ),
          ),
        },
        h(
          Mui.Box,
          { sx: { p: 3 } },
          h(Mui.Typography, { variant: 'h5' }, greeting || '...'),
          h(
            Mui.Typography,
            { variant: 'body2', color: 'text.secondary', sx: { mt: 1 } },
            'The greeting came from the main-process half of the extension.',
          ),
        ),
      );
    };

    return {
      activate(extensionApi) {
        api = extensionApi;

        api.navigation.addItem({
          id: 'hello',
          path: '/app/hello',
          label: 'Hello',
          description: 'Example extension screen',
          icon: HelloIcon,
          testId: 'nav-item-hello',
          order: 750,
        });

        api.screens.add({
          id: 'hello',
          paths: ['hello'],
          Component: HelloScreen,
        });

        api.commands.add({
          id: 'hello.greet',
          label: 'Hello: Greet',
          run: async () => {
            const greeting = await api.ipc.invoke('hello:greet', 'you');
            api.log.info(greeting);
          },
        });
      },
    };
  },
);
